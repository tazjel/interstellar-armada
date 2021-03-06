/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file This module manages and provides the Battle screen of the Interstellar Armada game.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 2.0
 */

/*jslint nomen: true, white: true, plusplus: true*/
/*global define, document, setInterval, clearInterval, window, performance */

/**
 * @param utils Used for string formatting, async calls.
 * @param vec Used for vector operation for the HUD elements.
 * @param mat Used for matrix operation for the HUD elements, displaying matrix stats and orienting random ships.
 * @param application Used for displaying errors and logging.
 * @param game Used for navigation
 * @param components Used for the components of the screen (e.g. loading box)
 * @param screens The battle screen is a HTMLScreenWithCanvases.
 * @param renderableObjects Used for creating the HUD elements
 * @param sceneGraph Used for creating the battle scene and the nodes for the HUD elements.
 * @param resources Used for accessing the resources for the HUD and for requesting the loading of reasourcing and setting callback for when they are ready.
 * @param egomModel Used for creating the models for the HUD elements
 * @param strings Used for translation support.
 * @param armadaScreens Used for common screen constants.
 * @param graphics Used for accessing graphics settings.
 * @param audio Used for controlling volume (muting when opening the menu)
 * @param classes Used for HUD elements for convenient acquiry of their resources.
 * @param config Used to access game setting / configuration.
 * @param control Used for global game control functions.
 * @param missions Used for creating the Mission object, accessing enums.
 * @param equipment Used to access flight mode constants
 * @param ai Used for performing the AI control operations in the battle simulation loop.
 */
define([
    "utils/utils",
    "utils/vectors",
    "utils/matrices",
    "modules/application",
    "modules/game",
    "modules/components",
    "modules/screens",
    "modules/media-resources",
    "modules/egom-model",
    "modules/scene/renderable-objects",
    "modules/scene/scene-graph",
    "armada/strings",
    "armada/screens/shared",
    "armada/graphics",
    "armada/audio",
    "armada/logic/classes",
    "armada/configuration",
    "armada/control",
    "armada/logic/missions",
    "armada/logic/equipment",
    "armada/logic/ai",
    "utils/polyfill"
], function (
        utils, vec, mat,
        application, game, components, screens, resources, egomModel,
        renderableObjects, sceneGraph,
        strings, armadaScreens, graphics, audio, classes, config, control, missions, equipment, ai) {
    "use strict";
    var
            // ------------------------------------------------------------------------------
            // constants
            STATS_PARAGRAPH_ID = "stats",
            LOADING_BOX_ID = "loadingBox",
            INFO_BOX_ID = "infoBox",
            BATTLE_CANVAS_ID = "battleCanvas",
            LOOP_CANCELED = -1,
            LOOP_REQUESTANIMFRAME = -2,
            LOADING_RANDOM_ITEMS_PROGRESS = 5,
            LOADING_BUILDING_SCENE_PROGRESS = 10,
            LOADING_RESOURCES_START_PROGRESS = 20,
            LOADING_RESOURCE_PROGRESS = 60,
            LOADING_INIT_WEBGL_PROGRESS = LOADING_RESOURCES_START_PROGRESS + LOADING_RESOURCE_PROGRESS,
            /**
             * When creating the battle scene, the camera will be created with this FOV, but it will be immediately overwritten by the 
             * FOV set for the first scene view of the loaded mission, therefore no point in making this settable.
             * @type Number
             */
            INITIAL_CAMERA_FOV = 40,
            INITIAL_CAMERA_SPAN = 0.2,
            HUD_ELEMENT_CLASS_NAME = "hudElementClass",
            HUD_ELEMENT_MODEL_NAME_PREFIX = "squareModel",
            MODEL_NAME_INFIX = "-",
            UI_2D_SHADER_NAME = "ui2d",
            UI_3D_SHADER_NAME = "ui3d",
            UI_2D_MIX_VIEWPORT_SHADER_NAME = "ui2d-mix-viewport",
            UI_2D_CLIP_VIEWPORT_SHADER_NAME = "ui2d-clip-viewport",
            // identifiers for music tracks
            AMBIENT_THEME = "ambient",
            ANTICIPATION_THEME = "anticipation",
            COMBAT_THEME = "combat",
            VICTORY_THEME = "victory",
            DEFEAT_THEME = "defeat",
            // ------------------------------------------------------------------------------
            // private variables
            /**
             * The mission object storing and simulating the game-logic model of the battle
             * @type Mission
             */
            _mission,
            /**
             * The scene that is used to render the battle
             * @type Scene
             */
            _battleScene,
            /**
             * The ID of the loop function that is set to run the game simulation
             * @type Number
             */
            _simulationLoop,
            /**
             * This stores the value of the cursor as it was used in the battle, while some menu is active
             * @type String
             */
            _battleCursor,
            /**
             * Stores the timestamp of the last simulation step
             * @type DOMHighResTimeStamp
             */
            _prevDate,
            /**
             * Whether the time is stopped in the simulated battle currently
             * @type Boolean
             */
            _isTimeStopped,
            /**
             * A function handling the resizing of the window from the battle screen's perspective is stored in this variable
             * @type Function
             */
            _handleResize,
            /**
             * The object that will be returned as this module
             * @type Battle
             */
            _battle = {},
            /**
             * The name (including the path within the mission folder) of the loaded mission file.
             * @type String
             */
            _missionSourceFilename,
            /**
             * Whether the game is in demo mode, in which all spacecrafts are controlled by AI and automatic camera switching is performed.
             * @type Boolean
             */
            _demoMode,
            /**
             * The total time elapsed in simulation since the battle began, in milliseconds
             * @type Number
             */
            _elapsedTime,
            /**
             * The time elapsed since last switching view in demo mode, in milliseconds.
             * @type Number
             */
            _timeInSameView,
            /**
             * Whether the game's end state has already changed to victory or defeat in the current battle.
             * @type Boolean
             */
            _gameStateChanged,
            /**
             * Whether the game's end state (victory / defeat) has already been displayed for the player.
             * @type Boolean
             */
            _gameStateShown,
            /**
             * The elapsed simulation time since the game's end state changed to victory or defeat. In milliseconds
             * @type Number
             */
            _timeSinceGameStateChanged,
            /**
             * A reference to the followed spacecraft (if any, as last displayed on the HUD)
             * @type Spacecraft
             */
            _spacecraft,
            /**
             * The hull integrity of the followed spacecraft (if any, as last displayed on the HUD)
             * @type Number
             */
            _spacecraftHullIntegrity,
            /**
             * A reference to the target of the followed spacecraft (if any, as last displayed on the HUD)
             * @type Spacecraft
             */
            _target,
            /**
             * The hull integrity of the target of the followed spacecraft (if any, as last displayed on the HUD)
             * @type Number
             */
            _targetHullIntegrity,
            /**
             * The time left from the hull integrity decrease HUD animation, in milliseconds
             * @type Number
             */
            _hullIntegrityDecreaseTime,
            /**
             * The time left from the target hull integrity decrease HUD animation, in milliseconds
             * @type Number
             */
            _targetHullIntegrityDecreaseTime,
            /**
             * The time left from the target switch HUD animation, in milliseconds
             * @type Number
             */
            _targetSwitchTime,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // music related
            /**
             * The elapsed simulation time since a spacecraft last fired at a hostile target. (for deciding whether there is combat going
             * on to choose the right music track) In milliseconds
             * @type Number
             */
            _timeSinceLastFire,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // cached configuration settings
            /**
             * Cached setting of theduration while the combat theme is kept playing during battle after a spacecraft fires at a hostile 
             * target, in milliseconds
             * @type Number
             */
            _combatThemeDurationAfterFire,
            // ................................................................................................
            // elements of the HUD and their stored state
            /**
             * Whether the HUD should be currently displayed.
             * @type Boolean
             */
            _isHUDVisible,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // central elements
            /**
             * A crosshair that is always shown at the center of the screen when the camera is set to an aiming view of a spacecraft.
             * @type HUDElement
             */
            _centerCrosshair,
            /**
             * Crosshairs that are shown in the line of fire of the weapons of the followed ship, at the same distance as the estimated
             * hit position.
             * @type HUDElement[]
             */
            _weaponImpactIndicators,
            /**
             * A bar showing the hull integrity of the current target near the center of the HUD.
             * @type HUDElement
             */
            _targetHullIntegrityQuickViewBar,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // cursor
            /**
             * When a spacecraft is controlled by the mouse, this HUD element is shown at the position of the cursor if it is within the 
             * deadzone (is not triggering a turn of the controlled spacecraft).
             * @type HUDElement
             */
            _hudStillCursor,
            /**
             * When a spacecraft is controlled by the mouse, this HUD element is shown at the position of the cursor if it is outside the 
             * deadzone (is triggering a turn of the controlled spacecraft), pointing towards the direction of the triggered turn.
             * @type HUDElement
             */
            _hudTurnCursor,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // 3D position based target info
            /**
             * A reticle that is shown at the location of the target of the followed spacecraft, if that exists.
             * @type HUDElement
             */
            _targetIndicator,
            /**
             * An arrow that points in the direction of the current target, if it is not visible on the screen.
             * @type HUDElement
             */
            _targetArrow,
            /**
             * A reticle that is shown at the estimated location towards which the followed spacecraft has to fire in order to hit the
             * current target, given the current velocity of both and the speed of the first fired projectile of the first equipped weapon.
             * @type HUDElement
             */
            _aimAssistIndicator,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // target info panel
            /**
             * The scene to which a view of the currently selected target ship is rendered.
             * @type Scene
             */
            _targetScene,
            /**
             * A reference to the currently displayed spacecraft in the target view scene.
             * @type Spacecraft
             */
            _targetViewItem,
            /**
             * The RGBA color of the currently displayed spacecraft in the target view screen. (based on its hull integrity)
             * @type Number[4]
             */
            _targetViewItemColor,
            /**
             * A rectangle displayed as the background of the panel showing the information about the current target (including the target
             * view scene, hull integrity bar, textual information...), if there is one selected.
             * @type HUDElement
             */
            _targetInfoBackground,
            /**
             * A bar showing the current hull integrity of the selected target within the target info panel.
             * @type HUDElement
             */
            _targetHullIntegrityBar,
            /**
             * Houses all the texts that display information about the current target within the target info panel.
             * @type TextLayer
             */
            _targetInfoTextLayer,
            /**
             * Displays the name of the currently targeted spacecraft within the target info panel.
             * @type CanvasText
             */
            _targetInfoNameText,
            /**
             * Displays the name of the class of the currently targeted spacecraft within the target info panel.
             * @type CanvasText
             */
            _targetInfoClassText,
            /**
             * Displays the name of the team of the currently targeted spacecraft within the target info panel.
             * @type CanvasText
             */
            _targetInfoTeamText,
            /**
             * Displays the distance from the currently targeted spacecraft within the target info panel.
             * @type CanvasText
             */
            _targetInfoDistanceText,
            /**
             * Displays the velocity of the currently targeted spacecraft within the target info panel.
             * @type CanvasText
             */
            _targetInfoVelocityText,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // speed and drift indicators
            /**
             * Displays the current forward or reverse speed compared to a calculated maximum in the form of a partially filled bar.
             * @type HUDElement
             */
            _speedBar,
            /**
             * Highlights the current target (intended) forward or reverse speed within the speed bar.
             * @type HUDElement
             */
            _speedTargetIndicator,
            /**
             * Houses the texts displaying the current and reference speed values.
             * @type TextLayer
             */
            _speedTextLayer,
            /**
             * Displays the current calculated reference (forward or reverse) speed (relative to which the speed bar is filled) next to (the 
             * top or bottom of) the speed bar.
             * @type CanvasText
             */
            _maxSpeedText,
            /**
             * Displays the current (forward or reverse) speed of the followed spacecraft next to the speed bar.
             * @type CanvasText
             */
            _currentSpeedText,
            /**
             * An arrow pointing towards the direction the followed spacecraft is drifting towards with a color based on the intensity of
             * the drift.
             * @type HUDElement
             */
            _driftArrow,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // hull integrity bar
            /**
             * Displays the hull integrity of the followed spacecraft.
             * @type HUDElement
             */
            _hullIntegrityBar,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // flight mode indicator
            /**
             * A rectangle displayed as the background for the flight mode indicator panel.
             * @type HUDElement
             */
            _flightModeIndicatorBackground,
            /**
             * Houses the texts of the flight mode indicator panel.
             * @type TextLayer
             */
            _flightModeIndicatorTextLayer,
            /**
             * Displays the header text (i.e. "Flight mode:") on the flight mode indicator panel.
             * @type CanvasText
             */
            _flightModeHeaderText,
            /**
             * Displays the current flight mode on the flight mode indicator panel.
             * @type CanvasText
             */
            _flightModeText,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // headers
            /**
             * Houses the header texts.
             * @type TextLayer
             */
            _headerTextLayer,
            /**
             * Displays a smaller header text at the top center of the screen, shown/hidden independently from the HUD, used for displaying
             * version info.
             * @type CanvasText
             */
            _smallHeaderText,
            /**
             * Displays a larger header text below the small one, shown/hidden with the rest of the HUD.
             * @type CanvasText
             */
            _bigHeaderText,
            /**
             * Displays a smaller header text below the big one, shown/hidden with the rest of the HUD.
             * @type CanvasText
             */
            _subheaderText,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // top left
            /**
             * Houses the score text
             * @type TextLayer
             */
            _topLeftTextLayer,
            /**
             * Displays the score of the player
             * @type CanvasText
             */
            _scoreText,
            // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
            // objectives indicator
            /**
             * A rectangle displayed as the background for the mission objective indicator panel.
             * @type HUDElement
             */
            _objectivesBackground,
            /**
             * Houses the texts of the mission objective indicator panel.
             * @type TextLayer
             */
            _objectivesTextLayer,
            /**
             * Displays the header text (i.e. "Objectives:") on the mission objective indicator panel.
             * @type CanvasText
             */
            _objectivesHeaderText,
            /**
             * Displays the objectives on the mission objective indicator panel.
             * @type CanvasText[]
             */
            _objectivesTexts,
            // ................................................................................................
            // cached references of setting values used for the layout of the HUD
            /**
             * (enum ScaleMode) Stores the scaling mode to use for the center crosshair for quicker access.
             * @type String
             */
            _centerCrosshairScaleMode,
            /**
             * Stores a reference to the layout used for the target view scene for quicker access.
             * @type ClipSpaceLayout
             */
            _targetViewLayout,
            /**
             * Stores a reference to the layout used for the target info background HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _targetInfoBackgroundLayout,
            /**
             * Stores a reference to the layout used for the target hull integrity bar HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _targetHullIntegrityBarLayout,
            /**
             * Stores a reference to the layout used for the speed bar HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _speedBarLayout,
            /**
             * Stores a reference to the size used for the speed target indicator HUD element for quicker access.
             * @type Number[2]
             */
            _speedTargetIndicatorSize,
            /**
             * Stores a reference to the layout used for the hull integrity bar HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _hullIntegrityBarLayout,
            /**
             * Stores a reference to the layout used for the flight mode indicator background HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _flightModeIndicatorBackgroundLayout,
            /**
             * Stores a reference to the layout used for the target hull integrity quick view bar HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _targetHullIntegrityQuickViewBarLayout,
            /**
             * Stores a reference to the layout used for the mission objective indicator background HUD element for quicker access.
             * @type ClipSpaceLayout
             */
            _objectivesBackgroundLayout,
            // ................................................................................................
            // other cached setting values used for the HUD
            /**
             * The duration of the target switch animation (scaling applied to target indicator reticle / arrow and weapon impact indicators),
             * in milliseconds
             * @type Number
             */
            _hudTargetSwitchAnimationDuration,
            /**
             * The duration of the hull integrity decrease animation (highlighting hull integrity bar), in milliseconds
             * @type Number
             */
            _hudHullIntegrityDecreaseAnimationDuration,
            /**
             * The duration of the target hull integrity decrease animation (highlighting target hull integrity quick view bar), in milliseconds
             * @type Number
             */
            _hudTargetHullIntegrityDecreaseAnimationDuration,
            /**
             * The horizontal and vertical base size of the target indicator reticle
             * @type Number[2]
             */
            _targetIndicatorSize,
            /**
             * The scaling to apply to the target indicator reticle at the start of the target switch HUD animation
             * @type Number
             */
            _targetIndicatorSwitchScale,
            /**
             * The horizontal and vertical base size of the target indicator arrow
             * @type Number[2]
             */
            _targetArrowSize,
            /**
             * The scaling to apply to the target indicator arrow at the start of the target switch HUD animation
             * @type Number
             */
            _targetArrowSwitchScale,
            /**
             * The horizontal and vertical base size of the weapon impact indicators
             * @type Number[2]
             */
            _weaponImpactIndicatorSize,
            /**
             * The scaling to apply to the weapon impact indicators at the start of the target switch HUD animation
             * @type Number
             */
            _weaponImpactIndicatorSwitchScale,
            /**
             * The minimum drift speed at which the drift arrow HUD element is displayed.
             * @type Number
             */
            _driftArrowMinSpeed,
            /**
             * The factor by which to multiply the acceleration of the followed spacecraft to get the drift speed at which the drift arrow is
             * displayed with the max speed color.
             * @type Number
             */
            _driftArrowMaxSpeedFactor;
    // ------------------------------------------------------------------------------
    // private functions
    /**
     * Updates the state / mood based music theme for the case a spacecraft just fired.
     * @param {Spacecraft} spacecraft The spacecraft that fired
     * @param {Spacecraft} target The target of the spacecraft that fired (the player shooting at friends / into emptyness will not change
     * the mood)
     */
    function _handleSpacecraftFired(spacecraft, target) {
        if (target && target.isHostile(spacecraft) && !_gameStateShown) {
            _timeSinceLastFire = 0;
            audio.playMusic(COMBAT_THEME);
        }
    }
    /**
     * Executes one simulation (and control) step for the battle.
     */
    function _simulationLoopFunction() {
        var followedCraft, curDate, dt;
        if (_simulationLoop !== LOOP_CANCELED) {
            curDate = performance.now();
            dt = curDate - _prevDate;
            control.control(dt);
            ai.control(dt);
            followedCraft = _mission.getFollowedSpacecraftForScene(_battleScene);
            if (!_isTimeStopped) {
                _mission.tick(dt, _battleScene);
                _elapsedTime += dt;
                if (!_gameStateShown) {
                    _timeSinceLastFire += dt;
                    if (_timeSinceLastFire > _combatThemeDurationAfterFire) {
                        audio.playMusic(ANTICIPATION_THEME);
                    }
                }
            }
            if (followedCraft) {
                // handling the loss of the spacecraft that is followed by the camera
                if (followedCraft.canBeReused()) {
                    if (control.isInPilotMode()) {
                        control.switchToSpectatorMode(true);
                    } else if (_demoMode) {
                        _battleScene.getCamera().followNextNode();
                        _timeInSameView = 0;
                    }
                } else if (_demoMode) {
                    // automatic view switching in demo mode
                    _timeInSameView += dt;
                    if (_timeInSameView > config.getSetting(config.BATTLE_SETTINGS.DEMO_VIEW_SWITCH_INTERVAL)) {
                        _timeInSameView = 0;
                        _battleScene.getCamera().changeToNextView();
                        if (Math.random() < config.getSetting(config.BATTLE_SETTINGS.DEMO_DOUBLE_VIEW_SWITCH_CHANCE)) {
                            _battleScene.getCamera().changeToNextView();
                        }
                    }
                }
            }
            _prevDate = curDate;
        }
    }
    /**
     * Removes the stored renferences to the logic and graphical models of the battle.
     */
    function _clearData() {
        if (_mission) {
            _mission.destroy();
        }
        _mission = null;
        if (_battleScene) {
            _battleScene.clearNodes();
            _battleScene.clearDirectionalLights();
            _battleScene.clearPointLights();
            _battleScene.clearSpotLights();
        }
        _battleScene = null;
        audio.playMusic(null);
    }
    // ------------------------------------------------------------------------------
    // public functions
    /**
     * Stops the time in the battle simulation.
     */
    function stopTime() {
        _isTimeStopped = true;
        if (_battleScene) {
            _battleScene.setShouldAnimate(false);
        }
    }
    /**
     * Resumes the time in the battle simulation
     */
    function resumeTime() {
        if (_battleScene) {
            _battleScene.setShouldAnimate(true);
        }
        _isTimeStopped = false;
    }
    /**
     * Changes whether the time is stopped in the simulation to the opposite of the current value
     */
    function toggleTime() {
        if (_isTimeStopped) {
            resumeTime();
        } else {
            stopTime();
        }
    }
    /**
     * Hides all elements of the HUD. (rendering the battle screen after this will not show the HUD)
     */
    function hideHUD() {
        _isHUDVisible = false;
    }
    /**
     * Shows all elements of the HUD. (rendering the battle screen after this will show the HUD)
     */
    function showHUD() {
        _isHUDVisible = true;
    }
    /**
     * Switches the current state of visibility of the HUD to its opposite.
     */
    function toggleHUDVisibility() {
        _isHUDVisible = !_isHUDVisible;
    }
    // ##############################################################################
    /**
     * @class Can be used to represent an element of the HUD, for which it can create an appropriate UIElement and add it to the battle scene.
     * @param {String} shaderName The name of the shader to use for rendering this element.
     * @param {String} textureName The name of the common texture resource to use for this element.
     * @param {Number[2]|Number[3]} position The 2D or 3D (starting) position of the element (depending on the shader used)
     * @param {Number[2]} size The 2D size factor of the element to scale it.
     * @param {String} scaleMode (enum ScaleMode) The scaling mode to be used to size this element.
     * @param {Number[4]} color An RGBA color for the element it can be modulated with. (inside the clip zone)
     * @param {Number[4]} [clipColor] An RGBA color to be used for modulation outside the clip zone set for the element.
     * @param {Number[2][2]} [textureCoordinates] The coordinates for the top-left and bottom-right corners of the section of the texture
     * image to use for texture mapping (or other corners if flipped horizontally or vertically) If not given, the whole image is used.
     * (0;0) is top-left and (1;1) is bottom-right of the image
     */
    function HUDElement(shaderName, textureName, position, size, scaleMode, color, clipColor, textureCoordinates) {
        /**
         * Manages the acquiry of appropriate resources.
         * @type TexturedModelClass
         */
        this._class = new classes.TexturedModelClass({
            name: HUD_ELEMENT_CLASS_NAME,
            shader: shaderName,
            texture: textureName
        });
        /**
         * The 2D or 3D (starting) position of the element (depending on the shader used)
         * @type Number[2]|Number[3]
         */
        this._position = position;
        /**
         * The 2D factor of the element to scale it.
         * @type Number[2]
         */
        this._scale = [0.5 * size[0], 0.5 * size[1]]; // square model coordinates are -1 to 1, resulting in a scale of 1 corresponding to a size of 2
        /**
         * (enum ScaleMode) The scaling mode to be used to size this element.
         * @type String
         */
        this._scaleMode = scaleMode;
        /**
         * An RGBA color for the element it can be modulated with. (inside the clip zone)
         * @type Number[4]
         */
        this._color = color;
        /**
         * The current angle for the element to be rotated by in 2D, in radians.
         * @type Number
         */
        this._angle = 0;
        /**
         * The coordinates specifying the clip zone for this element, in the form of [minX, maxX, minY, maxY], where the area outside the
         * min-max range on either the X or Y is considered to be outside the clip zone, and all coordinates go from -1 (left / bottom) to
         * 1 (right / top), corresponding to a relative position within the element.
         * @type Number[4]
         */
        this._clipCoordinates = renderableObjects.CLIP_COORDINATES_NO_CLIP.slice();
        /**
         * An RGBA color to be used for modulation outside the clip zone set for the element.
         * @type Number[4]
         */
        this._clipColor = clipColor || [0, 0, 0, 0];
        /**
         * The coordinates for the top-left and bottom-right corners of the section of the texture image to use for texture mapping (or 
         * other corners if flipped horizontally or vertically) When not set, the whole image is used.
         * (0;0) is top-left and (1;1) is bottom-right of the image
         * @type Number[2][2]
         */
        this._textureCoordinates = textureCoordinates;
        /**
         * A reference to the visual model that is used to add a representation of this element to the scene.
         * @type UIElement
         */
        this._visualModel = null;
        /**
         * A reference to the node at which the visual model of this element is stored in the scene.
         * @type RenderableNode
         */
        this._node = null;
    }
    /**
     * Grabs the references to all needed resource objects and marks them for loading. Automatically called when the element is added to a scene.
     */
    HUDElement.prototype._acquireResources = function () {
        var modelName, model;
        modelName = HUD_ELEMENT_MODEL_NAME_PREFIX + (this._textureCoordinates ?
                MODEL_NAME_INFIX + (this._textureCoordinates[0].join(MODEL_NAME_INFIX) + MODEL_NAME_INFIX + this._textureCoordinates[1].join(MODEL_NAME_INFIX)) :
                "");
        model = resources.getModel(modelName, {allowNullResult: true});
        this._class.acquireResources({model: model || egomModel.squareModel(modelName, this._textureCoordinates)});
    };
    /**
     * Creates and stores a new visual model to represent this HUD element. Automatically called when the element is added to a scene.
     */
    HUDElement.prototype._createVisualModel = function () {
        this._visualModel = new renderableObjects.UIElement(
                this._class.getModel(),
                this._class.getShader(),
                this._class.getTexturesOfTypes(this._class.getShader().getTextureTypes(), graphics.getTextureQualityPreferenceList()),
                this._position,
                this._scale,
                this._scaleMode,
                this._color,
                Math.degrees(this._angle),
                this._clipCoordinates,
                this._clipColor);
    };
    /**
     * Returns the current 2D/3D position set for this element.
     * @returns {Number[2]|Number[3]}
     */
    HUDElement.prototype.getPosition = function () {
        return this._position;
    };
    /**
     * Returns the current scale factor used (on the X and Y axes) for the element.
     * @returns {Number[2]}
     */
    HUDElement.prototype.getScale = function () {
        return this._scale;
    };
    /**
     * Marks all needed resources for loading and sets a callback to add the visual model of this element to the passed scene if when all
     * resources are loaded (or adds it right away, if the resources are already loaded at the time of call)
     * @param {Scene} scene
     */
    HUDElement.prototype.addToScene = function (scene) {
        this._acquireResources();
        resources.executeWhenReady(function () {
            if (!this._visualModel) {
                this._createVisualModel();
            }
            this._node = scene.addUIObject(this._visualModel);
        }.bind(this));
    };
    /**
     * Hides the visual representation of this element in the scene it was added to.
     */
    HUDElement.prototype.hide = function () {
        this._node.hide();
    };
    /**
     * Shows (makes visible) the visual representation of this element in the scene it was added to.
     */
    HUDElement.prototype.show = function () {
        this._node.show();
    };
    /**
     * Sets a new position for this HUD element and its visual representation, if that exists.
     * @param {Number[2]|Number[3]} value
     */
    HUDElement.prototype.setPosition = function (value) {
        this._position = value;
        if (this._visualModel) {
            this._visualModel.setPosition(value);
        }
    };
    /**
     * Sets a new size for the element to be used for scaling it when rendering.
     * @param {Number[2]} value
     */
    HUDElement.prototype.setSize = function (value) {
        // square model coordinates are -1 to 1, resulting in a scale of 1 corresponding to a size of 2
        this._scale = [0.5 * value[0], 0.5 * value[1]];
        if (this._visualModel) {
            this._visualModel.setSize(this._scale);
        }
    };
    /**
     * Sets a new angle for this HUD element and its visual representation, if that exists.
     * @param {Number} value The new angle, in radians
     */
    HUDElement.prototype.setAngle = function (value) {
        this._angle = value;
        if (this._visualModel) {
            this._visualModel.setAngle(value);
        }
    };
    /**
     * Sets a new color for this HUD elements and its visual representation, if that exists.
     * @param {Number[4]} value RGBA color
     */
    HUDElement.prototype.setColor = function (value) {
        this._color = value;
        if (this._visualModel) {
            this._visualModel.setColor(value);
        }
    };
    /**
     * Sets new minimum and maximum X coordinates for the clip zone of the element.
     * @param {Number} minimum
     * @param {Number} maximum
     */
    HUDElement.prototype.clipX = function (minimum, maximum) {
        if (this._textureCoordinates) {
            minimum = utils.getLinearMix(this._textureCoordinates[0][0], this._textureCoordinates[1][0], minimum);
            maximum = utils.getLinearMix(this._textureCoordinates[0][0], this._textureCoordinates[1][0], maximum);
        }
        this._clipCoordinates[0] = minimum;
        this._clipCoordinates[1] = maximum;
        if (this._visualModel) {
            this._visualModel.clipX(minimum, maximum);
        }
    };
    /**
     * Sets new minimum and maximum Y coordinates for the clip zone of the element.
     * @param {Number} minimum
     * @param {Number} maximum
     */
    HUDElement.prototype.clipY = function (minimum, maximum) {
        if (this._textureCoordinates) {
            minimum = 1 - utils.getLinearMix(this._textureCoordinates[1][1], this._textureCoordinates[0][1], minimum);
            maximum = 1 - utils.getLinearMix(this._textureCoordinates[1][1], this._textureCoordinates[0][1], maximum);
        }
        this._clipCoordinates[2] = 1 - maximum;
        this._clipCoordinates[3] = 1 - minimum;
        if (this._visualModel) {
            this._visualModel.clipY(minimum, maximum);
        }
    };
    /**
     * Sets a new RGBA color for the element to be used for coloring it outsite its clip zone.
     * @param {Number[4]} value
     */
    HUDElement.prototype.setClipColor = function (value) {
        this._clipColor = value;
        if (this._visualModel) {
            this._visualModel.setClipColor(value);
        }
    };
    /**
     * Sets new absolute (viewport) coordinates for the position and size of the element applying the rules
     * of the passed clip space layout to a viewport of the given size.
     * @param {ClipSpaceLayout} layout
     * @param {Number} viewportWidth
     * @param {Number} viewportHeight
     */
    HUDElement.prototype.applyLayout = function (layout, viewportWidth, viewportHeight) {
        this.setPosition(layout.getPosition(viewportWidth, viewportHeight));
        this.setSize(layout.getSize(viewportWidth, viewportHeight));
    };
    // ------------------------------------------------------------------------------
    // private functions
    /**
     * Creates and returns a new HUD element that can be used as a weapon impact indicator.
     * @returns {HUDElement}
     */
    function _getWeaponImpactIndicator() {
        return new HUDElement(
                UI_3D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).texture,
                [0, 0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).colors.normal,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).mapping);
    }
    /**
     * Creates all HUD elements, marks their resources for loading if they are not loaded yet, and adds their visual models to the scene if
     * they are. If they are not loaded, sets callbacks to add them after the loading has finished.
     */
    function _addHUDToScene() {
        var i;
        // keep the ons with the same shader together for faster rendering
        _centerCrosshair = _centerCrosshair || new HUDElement(
                UI_2D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CENTER_CROSSHAIR).texture,
                [0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CENTER_CROSSHAIR).size,
                _centerCrosshairScaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CENTER_CROSSHAIR).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CENTER_CROSSHAIR).mapping);
        _centerCrosshair.addToScene(_battleScene);
        _driftArrow = _driftArrow || new HUDElement(
                UI_2D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).texture,
                [0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).colors.maxSpeed,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).mapping);
        _driftArrow.addToScene(_battleScene);
        _targetArrow = _targetArrow || new HUDElement(
                UI_2D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).texture,
                [0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).colors.hostile,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).mapping);
        _targetArrow.addToScene(_battleScene);
        _targetIndicator = _targetIndicator || new HUDElement(
                UI_3D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).texture,
                [0, 0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).colors.hostile,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).mapping);
        _targetIndicator.addToScene(_battleScene);
        _aimAssistIndicator = _aimAssistIndicator || new HUDElement(
                UI_3D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).texture,
                [0, 0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).colors.hostile,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).mapping);
        _aimAssistIndicator.addToScene(_battleScene);
        if (!_weaponImpactIndicators) {
            _weaponImpactIndicators = [_getWeaponImpactIndicator()];
        }
        for (i = 0; i < _weaponImpactIndicators.length; i++) {
            _weaponImpactIndicators[i].addToScene(_battleScene);
        }
        _targetInfoBackground = _targetInfoBackground || new HUDElement(
                UI_2D_MIX_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_BACKGROUND).texture,
                _targetInfoBackgroundLayout.getClipSpacePosition(),
                _targetInfoBackgroundLayout.getClipSpaceSize(),
                _targetInfoBackgroundLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_BACKGROUND).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_BACKGROUND).mapping);
        _targetInfoBackground.addToScene(_battleScene);
        _flightModeIndicatorBackground = _flightModeIndicatorBackground || new HUDElement(
                UI_2D_MIX_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_INDICATOR_BACKGROUND).texture,
                _flightModeIndicatorBackgroundLayout.getClipSpacePosition(),
                _flightModeIndicatorBackgroundLayout.getClipSpaceSize(),
                _flightModeIndicatorBackgroundLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_INDICATOR_BACKGROUND).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_INDICATOR_BACKGROUND).mapping);
        _flightModeIndicatorBackground.addToScene(_battleScene);
        _objectivesBackground = _objectivesBackground || new HUDElement(
                UI_2D_MIX_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_BACKGROUND).texture,
                _objectivesBackgroundLayout.getClipSpacePosition(),
                _objectivesBackgroundLayout.getClipSpaceSize(),
                _objectivesBackgroundLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_BACKGROUND).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_BACKGROUND).mapping);
        _objectivesBackground.addToScene(_battleScene);
        _targetHullIntegrityBar = _targetHullIntegrityBar || new HUDElement(
                UI_2D_CLIP_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_BAR).texture,
                _targetHullIntegrityBarLayout.getClipSpacePosition(),
                _targetHullIntegrityBarLayout.getClipSpaceSize(),
                _targetHullIntegrityBarLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_BAR).colors.filled,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_BAR).colors.empty,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_BAR).mapping);
        _targetHullIntegrityBar.addToScene(_battleScene);
        _speedBar = _speedBar || new HUDElement(
                UI_2D_CLIP_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).texture,
                _speedBarLayout.getClipSpacePosition(),
                _speedBarLayout.getClipSpaceSize(),
                _speedBarLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.filled,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.empty,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).mapping);
        _speedBar.addToScene(_battleScene);
        _speedTargetIndicator = _speedTargetIndicator || new HUDElement(
                UI_2D_CLIP_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TARGET_INDICATOR).texture,
                _speedBarLayout.getClipSpacePosition(),
                _speedBarLayout.getClipSpaceSize(),
                _speedBarLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TARGET_INDICATOR).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TARGET_INDICATOR).mapping);
        _speedTargetIndicator.addToScene(_battleScene);
        _hullIntegrityBar = _hullIntegrityBar || new HUDElement(
                UI_2D_CLIP_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).texture,
                _hullIntegrityBarLayout.getClipSpacePosition(),
                _hullIntegrityBarLayout.getClipSpaceSize(),
                _hullIntegrityBarLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.filled,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.empty,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).mapping);
        _hullIntegrityBar.addToScene(_battleScene);
        _targetHullIntegrityQuickViewBar = _targetHullIntegrityQuickViewBar || new HUDElement(
                UI_2D_CLIP_VIEWPORT_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).texture,
                _targetHullIntegrityQuickViewBarLayout.getClipSpacePosition(),
                _targetHullIntegrityQuickViewBarLayout.getClipSpaceSize(),
                _targetHullIntegrityQuickViewBarLayout.getScaleMode(),
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.hostileFilled,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).mapping);
        _targetHullIntegrityQuickViewBar.addToScene(_battleScene);
        _hudStillCursor = _hudStillCursor || new HUDElement(
                UI_2D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).texture,
                [0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).mappings.still);
        _hudStillCursor.addToScene(_battleScene);
        _hudTurnCursor = _hudTurnCursor || new HUDElement(
                UI_2D_SHADER_NAME,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).texture,
                [0, 0],
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).size,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).scaleMode,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).color,
                undefined,
                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CURSOR).mappings.turn);
        _hudTurnCursor.addToScene(_battleScene);
        // mark HUD sound effects for loading
        resources.getSoundEffect(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_SWITCH_SOUND).name);
        resources.getSoundEffect(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_SWITCH_DENIED_SOUND).name);
    }
    /**
     * Returns the HTML string to insert to messages that contains the key to open the menu in a highlighted style.
     * @returns {String}
     */
    function _getMenuKeyHTMLString() {
        return "<span class='highlightedText'>" + control.getInputInterpreter(control.KEYBOARD_NAME).getControlStringForAction("quit") + "</span>";
    }
    /**
     * Returns the HTML string to insert to messages that contains the key to engage jump engines in a highlighted style, with
     * a definite article added
     * @returns {String}
     */
    function _getJumpKeyHTMLString() {
        var result = control.getInputInterpreter(control.KEYBOARD_NAME).getControlStringForAction("jumpOut");
        return strings.getDefiniteArticleForWord(result) + " <span class='highlightedText'>" + result + "</span>";
    }
    // ##############################################################################
    /**
     * @class Represents the battle screen.
     * @extends HTMLScreenWithCanvases
     */
    function BattleScreen() {
        screens.HTMLScreenWithCanvases.call(this,
                armadaScreens.BATTLE_SCREEN_NAME,
                armadaScreens.BATTLE_SCREEN_SOURCE,
                {
                    cssFilename: armadaScreens.BATTLE_SCREEN_CSS,
                    backgroundClassName: armadaScreens.SCREEN_BACKGROUND_CLASS_NAME,
                    containerClassName: armadaScreens.SCREEN_CONTAINER_CLASS_NAME
                },
                graphics.getAntialiasing(),
                false,
                graphics.getFiltering(),
                config.getSetting(config.GENERAL_SETTINGS.USE_REQUEST_ANIM_FRAME));
        /**
         * @type SimpleComponent
         */
        this._stats = this.registerSimpleComponent(STATS_PARAGRAPH_ID);
        /**
         * @type LoadingBox
         */
        this._loadingBox = this.registerExternalComponent(new components.LoadingBox(
                LOADING_BOX_ID,
                armadaScreens.LOADING_BOX_SOURCE,
                {cssFilename: armadaScreens.LOADING_BOX_CSS},
                strings.LOADING.HEADER.name));
        /**
         * @type InfoBox
         */
        this._infoBox = this.registerExternalComponent(new components.InfoBox(
                INFO_BOX_ID,
                armadaScreens.INFO_BOX_SOURCE,
                {cssFilename: armadaScreens.INFO_BOX_CSS},
                strings.INFO_BOX.HEADER.name,
                strings.INFO_BOX.OK_BUTTON.name,
                {
                    show: function () {
                        this.pauseBattle();
                    }.bind(this),
                    hide: function () {
                        this.resumeBattle();
                        resumeTime();
                        if (!_demoMode) {
                            if (_mission.getPilotedSpacecraft()) {
                                control.switchToPilotMode(_mission.getPilotedSpacecraft());
                            }
                        } else {
                            control.switchToSpectatorMode(false, true);
                            _battleScene.getCamera().followNextNode();
                            _timeInSameView = 0;
                        }
                    }.bind(this),
                    buttonselect: armadaScreens.playButtonSelectSound,
                    buttonclick: armadaScreens.playButtonClickSound
                }));
    }
    BattleScreen.prototype = new screens.HTMLScreenWithCanvases();
    BattleScreen.prototype.constructor = BattleScreen;
    /**
     * @override
     * @returns {Boolean}
     */
    BattleScreen.prototype.hide = function () {
        if (screens.HTMLScreenWithCanvases.prototype.hide.call(this)) {
            this.pauseBattle();
            _clearData();
            return true;
        }
        return false;
    };
    /**
     * @override
     */
    BattleScreen.prototype._initializeComponents = function () {
        var canvas;
        screens.HTMLScreenWithCanvases.prototype._initializeComponents.call(this);
        canvas = this.getScreenCanvas(BATTLE_CANVAS_ID).getCanvasElement();
        _handleResize = function () {
            control.setScreenCenter(canvas.width / 2, canvas.height / 2);
        };
        window.addEventListener("resize", _handleResize);
        _handleResize();
    };
    /**
     * @override
     */
    BattleScreen.prototype._updateComponents = function () {
        screens.HTMLScreenWithCanvases.prototype._updateComponents.call(this);
    };
    /**
     * @override
     */
    BattleScreen.prototype.removeFromPage = function () {
        screens.HTMLScreenWithCanvases.prototype.removeFromPage.call(this);
        window.removeEventListener("resize", _handleResize);
    };
    /**
     * Pauses the battle by canceling all control, simulation and the render loop (e.g. for when a menu is 
     * displayed)
     */
    BattleScreen.prototype.pauseBattle = function () {
        control.stopListening();
        _battleCursor = document.body.style.cursor;
        document.body.style.cursor = 'default';
        if (_simulationLoop !== LOOP_REQUESTANIMFRAME) {
            clearInterval(_simulationLoop);
        }
        _simulationLoop = LOOP_CANCELED;
        if (_battleScene) {
            _battleScene.setShouldAnimate(false);
            _battleScene.setShouldUpdateCamera(false);
        }
        this.stopRenderLoop();
        audio.resetMusicVolume();
        audio.setMusicVolume(config.getSetting(config.BATTLE_SETTINGS.MUSIC_VOLUME_IN_MENUS) * audio.getMusicVolume(), false);
    };
    /**
     * Resumes the simulation and control of the battle and the render loop
     */
    BattleScreen.prototype.resumeBattle = function () {
        document.body.style.cursor = _battleCursor || 'default';
        if (_simulationLoop === LOOP_CANCELED) {
            _prevDate = performance.now();
            if (_battleScene) {
                if (!_isTimeStopped) {
                    _battleScene.setShouldAnimate(true);
                }
                _battleScene.setShouldUpdateCamera(true);
            }
            if (config.getSetting(config.GENERAL_SETTINGS.USE_REQUEST_ANIM_FRAME)) {
                _simulationLoop = LOOP_REQUESTANIMFRAME;
            } else {
                _simulationLoop = setInterval(_simulationLoopFunction, 1000 / (config.getSetting(config.BATTLE_SETTINGS.SIMULATION_STEPS_PER_SECOND)));
            }
            control.startListening();
            this.startRenderLoop(1000 / config.getSetting(config.BATTLE_SETTINGS.RENDER_FPS));
        } else {
            application.showError(
                    "Trying to resume simulation while it is already going on!",
                    application.ErrorSeverity.MINOR,
                    "No action was taken, to avoid double-running the simulation.");
        }
        audio.resetMusicVolume();
    };
    /**
     * Uses the loading box to show the status to the user.
     * @param {String} newStatus The status to show on the loading box. If
     * undefined, the status won't be updated.
     * @param {Number} newProgress The new value of the progress bar on the loading
     * box. If undefined, the value won't be updated.
     */
    BattleScreen.prototype._updateLoadingStatus = function (newStatus, newProgress) {
        if (newStatus !== undefined) {
            this._loadingBox.updateStatus(newStatus);
        }
        if (newProgress !== undefined) {
            this._loadingBox.updateProgress(newProgress);
        }
    };
    /**
     * Updates the loading box message and progress value to reflect the state given in the parameters.
     * @param {String} resourceName The name of the resource that have just finished loading
     * @param {String} resourceType The name of the resource that have just finished loading
     * @param {Number} totalResources The number of total resources to be loaded
     * @param {Number} loadedResources The number of resources that have already been loaded
     */
    BattleScreen.prototype._updateLoadingBoxForResourceLoad = function (resourceName, resourceType, totalResources, loadedResources) {
        this._updateLoadingStatus(
                utils.formatString(strings.get(strings.LOADING.RESOURCE_READY), {
                    resource: resourceName,
                    resourceType: resourceType,
                    loaded: loadedResources,
                    total: totalResources
                }),
                LOADING_RESOURCES_START_PROGRESS + (loadedResources / totalResources) * LOADING_RESOURCE_PROGRESS);
    };
    /**
     * Adds the text layers and texts of the HUD to the screen if needed.
     */
    BattleScreen.prototype._addUITexts = function () {
        var i, n,
                screenCanvas = this.getScreenCanvas(BATTLE_CANVAS_ID),
                getTargetInfoText = function (textPosition) {
                    return new screens.CanvasText(
                            textPosition,
                            "",
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).fontName,
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).fontSize,
                            _targetInfoBackgroundLayout.getScaleMode(),
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).colors.friendly);
                },
                getSpeedText = function (textPosition) {
                    return new screens.CanvasText(
                            textPosition,
                            "",
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).fontName,
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).fontSize,
                            _speedBarLayout.getScaleMode(),
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).colors.forward);
                },
                getObjectiveText = function (index) {
                    var position = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).position;
                    position = [position[0], position[1] + index * config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT_OFFSET)];
                    return new screens.CanvasText(
                            position,
                            "",
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).fontName,
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).fontSize,
                            _objectivesBackgroundLayout.getScaleMode(),
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).colors.inProgress);
                };
        // ..............................................................................
        // target info
        if (!_targetInfoTextLayer) {
            _targetInfoTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT_LAYER_LAYOUT));
            screenCanvas.addTextLayer(_targetInfoTextLayer);
        }
        if (!_targetInfoNameText) {
            _targetInfoNameText = getTargetInfoText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).positions.name);
            _targetInfoTextLayer.addText(_targetInfoNameText);
        }
        if (!_targetInfoClassText) {
            _targetInfoClassText = getTargetInfoText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).positions.class);
            _targetInfoTextLayer.addText(_targetInfoClassText);
        }
        if (!_targetInfoTeamText) {
            _targetInfoTeamText = getTargetInfoText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).positions.team);
            _targetInfoTextLayer.addText(_targetInfoTeamText);
        }
        if (!_targetInfoDistanceText) {
            _targetInfoDistanceText = getTargetInfoText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).positions.distance);
            _targetInfoTextLayer.addText(_targetInfoDistanceText);
        }
        if (!_targetInfoVelocityText) {
            _targetInfoVelocityText = getTargetInfoText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).positions.velocity);
            _targetInfoTextLayer.addText(_targetInfoVelocityText);
        }
        // ..............................................................................
        // speed bar
        if (!_speedTextLayer) {
            _speedTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT_LAYER_LAYOUT));
            screenCanvas.addTextLayer(_speedTextLayer);
        }
        if (!_maxSpeedText) {
            _maxSpeedText = getSpeedText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).positions.maxForward);
            _speedTextLayer.addText(_maxSpeedText);
        }
        if (!_currentSpeedText) {
            _currentSpeedText = getSpeedText(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).positions.maxReverse);
            _speedTextLayer.addText(_currentSpeedText);
        }
        // ..............................................................................
        // flight mode
        if (!_flightModeIndicatorTextLayer) {
            _flightModeIndicatorTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_INDICATOR_BACKGROUND).layout);
            screenCanvas.addTextLayer(_flightModeIndicatorTextLayer);
        }
        if (!_flightModeHeaderText) {
            _flightModeHeaderText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_HEADER_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_HEADER_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_HEADER_TEXT).fontSize,
                    _flightModeIndicatorBackgroundLayout.getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_HEADER_TEXT).color);
            _flightModeIndicatorTextLayer.addText(_flightModeHeaderText);
        }
        _flightModeHeaderText.setText(strings.get(strings.BATTLE.HUD_FLIGHT_MODE));
        if (!_flightModeText) {
            _flightModeText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).fontSize,
                    _flightModeIndicatorBackgroundLayout.getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).colors.compensated);
            _flightModeIndicatorTextLayer.addText(_flightModeText);
        }
        // ..............................................................................
        // headers
        if (!_headerTextLayer) {
            _headerTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HEADER_TEXT_LAYER_LAYOUT));
            screenCanvas.addTextLayer(_headerTextLayer);
        }
        if (!_smallHeaderText) {
            _smallHeaderText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SMALL_HEADER_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SMALL_HEADER_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SMALL_HEADER_TEXT).fontSize,
                    _headerTextLayer.getLayout().getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SMALL_HEADER_TEXT).color,
                    "center");
            _headerTextLayer.addText(_smallHeaderText);
        }
        if (!_bigHeaderText) {
            _bigHeaderText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.BIG_HEADER_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.BIG_HEADER_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.BIG_HEADER_TEXT).fontSize,
                    _headerTextLayer.getLayout().getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.BIG_HEADER_TEXT).color,
                    "center");
            _headerTextLayer.addText(_bigHeaderText);
        }
        if (!_subheaderText) {
            _subheaderText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SUBHEADER_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SUBHEADER_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SUBHEADER_TEXT).fontSize,
                    _headerTextLayer.getLayout().getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SUBHEADER_TEXT).color,
                    "center");
            _headerTextLayer.addText(_subheaderText);
        }
        // ..............................................................................
        // top left
        if (!_topLeftTextLayer) {
            _topLeftTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TOP_LEFT_TEXT_LAYER_LAYOUT));
            screenCanvas.addTextLayer(_topLeftTextLayer);
        }
        if (!_scoreText) {
            _scoreText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SCORE_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SCORE_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SCORE_TEXT).fontSize,
                    _topLeftTextLayer.getLayout().getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SCORE_TEXT).color,
                    "left");
            _topLeftTextLayer.addText(_scoreText);
        }
        // ..............................................................................
        // objectives
        if (!_objectivesTextLayer) {
            _objectivesTextLayer = new screens.TextLayer(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_BACKGROUND).layout);
            screenCanvas.addTextLayer(_objectivesTextLayer);
        }
        if (!_objectivesHeaderText) {
            _objectivesHeaderText = new screens.CanvasText(
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_HEADER_TEXT).position,
                    "",
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_HEADER_TEXT).fontName,
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_HEADER_TEXT).fontSize,
                    _objectivesBackgroundLayout.getScaleMode(),
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_HEADER_TEXT).color);
            _objectivesTextLayer.addText(_objectivesHeaderText);
        }
        _objectivesHeaderText.setText(strings.get(strings.BATTLE.HUD_OBJECTIVES));
        if (!_objectivesTexts) {
            _objectivesTexts = [];
            n = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.MAX_OBJECTIVES_DISPLAYED);
            for (i = 0; i < n; i++) {
                _objectivesTexts.push(getObjectiveText(i));
                _objectivesTextLayer.addText(_objectivesTexts[i]);
            }
        }
    };
    /**
     * Shows the stats (FPS, draw stats) component.
     */
    BattleScreen.prototype.showDevelopmentInfo = function () {
        this._stats.show();
        _smallHeaderText.show();
    };
    /**
     * Hides the stats (FPS, draw stats) component.
     */
    BattleScreen.prototype.hideDevelopmentInfo = function () {
        this._stats.hide();
        _smallHeaderText.hide();
    };
    /**
     * Toggles the visibility of the development related information (e.g. version info header and FPS count) on the screen.
     */
    BattleScreen.prototype.toggleDevInfoVisibility = function () {
        if (this._stats.isVisible()) {
            this.hideDevelopmentInfo();
        } else {
            this.showDevelopmentInfo();
        }
    };
    /**
     * Shows the given message to the user in an information box.
     * @param {String} message
     */
    BattleScreen.prototype.showMessage = function (message) {
        this._infoBox.updateMessage(message);
        this._infoBox.show();
    };
    /**
     * Updates the big header's content on the screen.
     * @param {String} content
     * @param {Object} [replacements]
     */
    BattleScreen.prototype.setHeaderContent = function (content, replacements) {
        if (_bigHeaderText) {
            _bigHeaderText.setText(content, replacements);
        }
    };
    /**
     * Updates the subheader's content on the screen.
     * @param {String} content
     * @param {Object} [replacements]
     */
    BattleScreen.prototype.setSubheaderContent = function (content, replacements) {
        if (_subheaderText) {
            _subheaderText.setText(content, replacements);
        }
    };
    /**
     * Updates the contents of the HUDF with information about the currently followed spacecraft
     * @param {Number} dt The time elapsed since the last HUD update (in milliseconds)
     */
    BattleScreen.prototype._updateHUD = function (dt) {
        var
                /** @type Spacecraft */
                craft = _mission ? _mission.getFollowedSpacecraftForScene(_battleScene) : null,
                target,
                /** @type Number */
                distance, aspect, i, scale, futureDistance, animationProgress,
                hullIntegrity,
                acceleration, speed, absSpeed, maxSpeed, stepFactor, speedRatio, speedTarget, driftSpeed, driftArrowMaxSpeed, arrowPositionRadius,
                /** @type Weapon[] */
                weapons,
                /** @type Number[2] */
                position2D, direction2D, maxSpeedTextPosition, maxReverseSpeedTextPosition,
                /** @type Number[3] */
                position, targetPosition, vectorToTarget, futureTargetPosition, slotPosition, basePointPosition, relativeVelocity,
                /** @type Number[4] */
                direction, targetInfoTextColor, filledColor, emptyColor,
                /** @type Float32Array */
                m, scaledOriMatrix,
                /** @type HTMLCanvasElement */
                canvas = this.getScreenCanvas(BATTLE_CANVAS_ID).getCanvasElement(),
                /** @type Boolean */
                isInAimingView, behind, targetInRange, targetIsHostile, targetSwitched,
                /** @type MouseInputIntepreter */
                mouseInputInterpreter,
                /** @type String[] */
                objectivesState;
        if (craft && _isHUDVisible) {
            isInAimingView = craft.getView(_battleScene.getCamera().getConfiguration().getName()).isAimingView();
            // .....................................................................................................
            // header and score
            _bigHeaderText.show();
            if (control.isInPilotMode()) {
                _subheaderText.hide();
                _scoreText.setText(utils.formatString(strings.get(strings.BATTLE.SCORE), {
                    score: Math.round(craft.getScore())
                }));
                _scoreText.show();
            } else {
                _subheaderText.setText(craft.getDisplayName() || craft.getClass().getDisplayName());
                _subheaderText.show();
                _scoreText.hide();
            }
            // .....................................................................................................
            // center crosshair
            if (isInAimingView) {
                _centerCrosshair.show();
            } else {
                _centerCrosshair.hide();
            }
            // .....................................................................................................
            // cursor
            mouseInputInterpreter = control.getInputInterpreter(control.MOUSE_NAME);
            if (control.isListening() && mouseInputInterpreter.isEnabled() && control.isInPilotMode() && !control.isControllerPriority(control.CAMERA_CONTROLLER_NAME)) {
                position2D = mouseInputInterpreter.getMousePosition();
                position2D = [
                    (position2D[0] / canvas.width - 0.5) * 2,
                    (0.5 - position2D[1] / canvas.height) * 2
                ];
                direction2D = vec.normal2([position2D[0] * canvas.width / canvas.height, position2D[1]]);
                if (mouseInputInterpreter.isMouseDisplaced()) {
                    _hudStillCursor.hide();
                    _hudTurnCursor.show();
                    _hudTurnCursor.setPosition(position2D);
                    _hudTurnCursor.setAngle(vec.angle2u([0, 1], direction2D) * ((direction2D[0] < 0) ? -1 : 1));
                } else {
                    _hudStillCursor.show();
                    _hudTurnCursor.hide();
                    _hudStillCursor.setPosition(position2D);
                    _hudStillCursor.setAngle(vec.angle2u([0, 1], direction2D) * ((direction2D[0] < 0) ? -1 : 1));
                }
            } else {
                _hudStillCursor.hide();
                _hudTurnCursor.hide();
            }
            // .....................................................................................................
            // speed bar
            relativeVelocity = craft.getRelativeVelocityMatrix();
            speed = relativeVelocity[13];
            absSpeed = Math.abs(speed);
            acceleration = craft.getMaxAcceleration();
            maxSpeed = (config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR_BASE_MAX_SPEED_FACTOR) * acceleration) ||
                    config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR_DEFAULT_BASE_MAX_SPEED);
            stepFactor = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR_MAX_SPEED_STEP_FACTOR);
            while (maxSpeed < absSpeed) {
                maxSpeed *= stepFactor;
            }
            if (craft.hasSpeedTarget()) {
                speedTarget = craft.getSpeedTarget();
                if (speed * speedTarget >= 0) {
                    speedTarget = Math.abs(speedTarget);
                    while (maxSpeed < speedTarget) {
                        maxSpeed *= stepFactor;
                    }
                } else {
                    speedTarget = 0;
                }
            }
            speedRatio = absSpeed / maxSpeed;
            maxSpeedTextPosition = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).positions.maxForward;
            maxReverseSpeedTextPosition = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).positions.maxReverse;
            if (speed >= 0) {
                _speedBar.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.filled);
                _speedBar.setClipColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.empty);
                _speedBar.clipY(0, speedRatio);
                _maxSpeedText.setPosition(maxSpeedTextPosition);
                _maxSpeedText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).colors.forward);
                _maxSpeedText.setText(maxSpeed.toFixed());
                _currentSpeedText.setPosition([maxSpeedTextPosition[0], maxReverseSpeedTextPosition[1] + (maxSpeedTextPosition[1] - maxReverseSpeedTextPosition[1]) * speedRatio]);
                _currentSpeedText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).colors.forward);
                _currentSpeedText.setText(absSpeed.toFixed());
                _speedTargetIndicator.clipX(0.5 - _speedTargetIndicatorSize[0] / 2, 0.5 + _speedTargetIndicatorSize[0] / 2);
                if (craft.hasSpeedTarget()) {
                    _speedTargetIndicator.clipY(speedTarget / maxSpeed - _speedTargetIndicatorSize[1] / 2, speedTarget / maxSpeed + _speedTargetIndicatorSize[1] / 2);
                    _speedTargetIndicator.show();
                } else {
                    _speedTargetIndicator.hide();
                }
            } else {
                _speedBar.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.reverseFilled);
                _speedBar.setClipColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).colors.reverseEmpty);
                _speedBar.clipY(1 - speedRatio, 1);
                _maxSpeedText.setPosition(maxReverseSpeedTextPosition);
                _maxSpeedText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).colors.reverse);
                _maxSpeedText.setText("-" + maxSpeed.toFixed());
                _currentSpeedText.setPosition([maxSpeedTextPosition[0], maxSpeedTextPosition[1] - (maxSpeedTextPosition[1] - maxReverseSpeedTextPosition[1]) * speedRatio]);
                _currentSpeedText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TEXT).colors.reverse);
                _currentSpeedText.setText("-" + absSpeed.toFixed());
                _speedTargetIndicator.clipX(0.5 - _speedTargetIndicatorSize[0] / 2, 0.5 + _speedTargetIndicatorSize[0] / 2);
                if (craft.hasSpeedTarget()) {
                    _speedTargetIndicator.clipY(1 - (speedTarget / maxSpeed + _speedTargetIndicatorSize[1] / 2), 1 - (speedTarget / maxSpeed - _speedTargetIndicatorSize[1] / 2));
                    _speedTargetIndicator.show();
                } else {
                    _speedTargetIndicator.hide();
                }
            }
            _speedBar.applyLayout(_speedBarLayout, canvas.width, canvas.height);
            _speedTargetIndicator.applyLayout(_speedBarLayout, canvas.width, canvas.height);
            _speedTextLayer.show();
            // .....................................................................................................
            // drift arrow
            if (isInAimingView) {
                direction2D = [relativeVelocity[12], relativeVelocity[14]];
                driftSpeed = vec.length2(direction2D);
                vec.normalize2(direction2D);
                if (driftSpeed > _driftArrowMinSpeed) {
                    _driftArrow.show();
                    aspect = _battleScene.getCamera().getAspect();
                    arrowPositionRadius = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW_POSITION_RADIUS) * (utils.yScalesWithHeight(_centerCrosshairScaleMode, canvas.width, canvas.height) ? 1 : aspect);
                    _driftArrow.setPosition(vec.scaled2([direction2D[0] / aspect, direction2D[1]], arrowPositionRadius));
                    _driftArrow.setAngle(vec.angle2u([0, 1], direction2D) * ((direction2D[0] < 0) ? -1 : 1));
                    driftArrowMaxSpeed = _driftArrowMaxSpeedFactor * acceleration;
                    if (driftArrowMaxSpeed === 0) {
                        driftArrowMaxSpeed = maxSpeed;
                    }
                    _driftArrow.setColor(utils.getMixedColor(
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).colors.minSpeed,
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW).colors.maxSpeed,
                            Math.min((driftSpeed - _driftArrowMinSpeed) / (driftArrowMaxSpeed - _driftArrowMinSpeed), 1.0)));
                } else {
                    _driftArrow.hide();
                }
            } else {
                _driftArrow.hide();
            }
            // .....................................................................................................
            // hull integrity bar
            hullIntegrity = craft.getHullIntegrity();
            // color change animation when the integrity decreases
            if (craft !== _spacecraft) {
                _spacecraft = craft;
                _spacecraftHullIntegrity = hullIntegrity;
                animationProgress = 0;
                _hullIntegrityDecreaseTime = 0;
            } else if (hullIntegrity < _spacecraftHullIntegrity) {
                _spacecraftHullIntegrity = hullIntegrity;
                _hullIntegrityDecreaseTime = _hudHullIntegrityDecreaseAnimationDuration;
                animationProgress = 1;
            } else if (_hullIntegrityDecreaseTime > 0) {
                _hullIntegrityDecreaseTime -= dt;
                animationProgress = _hullIntegrityDecreaseTime / _hudHullIntegrityDecreaseAnimationDuration;
            }
            if (_hullIntegrityDecreaseTime > 0) {
                _hullIntegrityBar.setColor(utils.getMixedColor(
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.filled,
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.filledWhenDecreasing,
                        animationProgress));
                _hullIntegrityBar.setClipColor(utils.getMixedColor(
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.empty,
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.emptyWhenDecreasing,
                        animationProgress));
            } else {
                _hullIntegrityBar.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.filled);
                _hullIntegrityBar.setClipColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).colors.empty);
            }
            _hullIntegrityBar.clipY(0, hullIntegrity);
            _hullIntegrityBar.applyLayout(_hullIntegrityBarLayout, canvas.width, canvas.height);
            // .....................................................................................................
            // flight mode indicator
            _flightModeIndicatorBackground.applyLayout(_flightModeIndicatorBackgroundLayout, canvas.width, canvas.height);
            _flightModeText.setText(strings.get(strings.FLIGHT_MODE.PREFIX, craft.getFlightMode(), craft.getFlightMode()));
            switch (craft.getFlightMode()) {
                case equipment.FlightMode.FREE:
                    _flightModeText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).colors.free);
                    break;
                case equipment.FlightMode.COMPENSATED:
                    _flightModeText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).colors.compensated);
                    break;
                case equipment.FlightMode.RESTRICTED:
                    _flightModeText.setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_TEXT).colors.restricted);
                    break;
                default:
                    application.showError("Unknown flight mode: " + craft.getFlightMode() + "!");
            }
            _flightModeIndicatorTextLayer.show();
            // .....................................................................................................
            // objectives
            if (!_demoMode) {
                _objectivesBackground.applyLayout(_objectivesBackgroundLayout, canvas.width, canvas.height);
                objectivesState = _mission.getObjectivesState();
                for (i = 0; i < _objectivesTexts.length; i++) {
                    if (i < objectivesState.length) {
                        _objectivesTexts[i].setText(objectivesState[i].text);
                        switch (objectivesState[i].state) {
                            case missions.ObjectiveState.IN_PROGRESS:
                                _objectivesTexts[i].setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).colors.inProgress);
                                break;
                            case missions.ObjectiveState.COMPLETED:
                                _objectivesTexts[i].setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).colors.completed);
                                break;
                            case missions.ObjectiveState.FAILED:
                                _objectivesTexts[i].setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_TEXT).colors.failed);
                                break;
                        }
                    } else {
                        _objectivesTexts[i].setText("");
                    }
                }
                _objectivesTextLayer.show();
            } else {
                _objectivesTextLayer.hide();
            }
            // .....................................................................................................
            // target related information
            target = craft.getTarget();
            if (_target !== target) {
                _target = target;
                targetSwitched = true;
                _targetSwitchTime = _hudTargetSwitchAnimationDuration;
                animationProgress = 1;
            } else if (_targetSwitchTime > 0) {
                _targetSwitchTime -= dt;
                animationProgress = _targetSwitchTime / _hudTargetSwitchAnimationDuration;
            }
            if (target) {
                targetPosition = target.getPhysicalPositionVector();
                position = craft.getPhysicalPositionVector();
                vectorToTarget = vec.diff3(targetPosition, position);
                distance = vec.length3(vectorToTarget);
                weapons = craft.getWeapons();
                // targeting reticle at the target position
                _targetIndicator.setPosition(targetPosition);
                targetIsHostile = target.isHostile(craft);
                _targetIndicator.setColor(targetIsHostile ?
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).colors.hostile :
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).colors.friendly);
                // scaling according to the target switch animation
                if (_targetSwitchTime > 0) {
                    _targetIndicator.setSize(vec.scaled2(_targetIndicatorSize, 1 + (_targetIndicatorSwitchScale - 1) * animationProgress));
                } else {
                    _targetIndicator.setSize(_targetIndicatorSize);
                }
                _targetIndicator.show();
                if (weapons.length > 0) {
                    // aim assist indicator at the expected future position of the target
                    futureTargetPosition = craft.getTargetHitPosition();
                    _aimAssistIndicator.setPosition(futureTargetPosition);
                    _aimAssistIndicator.setColor(targetIsHostile ?
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).colors.hostile :
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.AIM_ASSIST_INDICATOR).colors.friendly);
                    _aimAssistIndicator.show();
                    // weapon crosshairs in the lines of fire
                    futureDistance = vec.length3(vec.diff3(futureTargetPosition, position));
                    m = craft.getPhysicalModel().getOrientationMatrix();
                    scale = craft.getVisualModel().getScalingMatrix()[0];
                    scaledOriMatrix = craft.getScaledOriMatrix();
                    targetInRange = false;
                    for (i = 0; i < weapons.length; i++) {
                        if (_weaponImpactIndicators.length <= i) {
                            _weaponImpactIndicators.push(_getWeaponImpactIndicator());
                            _weaponImpactIndicators[i].addToScene(_battleScene);
                        }
                        if (weapons[i].isFixed()) {
                            slotPosition = weapons[i].getOrigoPositionMatrix();
                            _weaponImpactIndicators[i].setPosition(vec.sumArray3([
                                position,
                                vec.scaled3(mat.getRowB43(m), futureDistance),
                                vec.scaled3(mat.getRowA43(m), slotPosition[12] * scale),
                                vec.scaled3(mat.getRowC43(m), slotPosition[14] * scale)]));
                        } else {
                            basePointPosition = weapons[i].getBasePointPosVector(scaledOriMatrix);
                            _weaponImpactIndicators[i].setPosition(vec.sum3(
                                    basePointPosition,
                                    vec.scaled3(mat.getRowB43(weapons[i].getProjectileOrientationMatrix()), vec.length3(
                                            vec.diff3(futureTargetPosition, basePointPosition)))));
                        }
                        if (futureDistance <= weapons[i].getRange(speed)) {
                            _weaponImpactIndicators[i].setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).colors.normal);
                            targetInRange = true;
                        } else {
                            _weaponImpactIndicators[i].setColor(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).colors.outOfRange);
                        }
                        // scaling according to the target switch animation
                        if (_targetSwitchTime > 0) {
                            _weaponImpactIndicators[i].setSize(vec.scaled2(_weaponImpactIndicatorSize, 1 + (_weaponImpactIndicatorSwitchScale - 1) * animationProgress));
                        } else {
                            _weaponImpactIndicators[i].setSize(_weaponImpactIndicatorSize);
                        }
                        _weaponImpactIndicators[i].show();
                    }
                    while (i < _weaponImpactIndicators.length) {
                        _weaponImpactIndicators[i].hide();
                        i++;
                    }
                    if (!targetInRange || (vec.dot3(mat.getRowB43(m), vectorToTarget) < 0)) {
                        _aimAssistIndicator.hide();
                    }
                } else {
                    // if there are no weapons equipped
                    _aimAssistIndicator.hide();
                    for (i = 0; i < _weaponImpactIndicators.length; i++) {
                        _weaponImpactIndicators[i].hide();
                    }
                }
                // target arrow, if the target is not visible on the screen
                direction = mat.getRowD4(mat.prod34(target.getPhysicalPositionMatrix(), _battleScene.getCamera().getViewMatrix(), _battleScene.getCamera().getProjectionMatrix()));
                behind = direction[3] < 0;
                vec.normalize4D(direction);
                if (behind || (direction[0] < -1) || (direction[0] > 1) || (direction[1] < -1) || (direction[1] > 1)) {
                    _targetArrow.show();
                    aspect = _battleScene.getCamera().getAspect();
                    direction[0] *= aspect;
                    vec.normalize2(direction);
                    if (behind) {
                        vec.negate2(direction);
                    }
                    arrowPositionRadius = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW_POSITION_RADIUS) * (utils.yScalesWithHeight(_centerCrosshairScaleMode, canvas.width, canvas.height) ? (1 / aspect) : 1);
                    _targetArrow.setPosition(vec.scaled2([direction[0], direction[1] * aspect], arrowPositionRadius));
                    _targetArrow.setAngle(vec.angle2u([0, 1], direction) * ((direction[0] < 0) ? -1 : 1));
                    _targetArrow.setColor(targetIsHostile ?
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).colors.hostile :
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).colors.friendly);
                    // scaling according to the target switch animation
                    if (_targetSwitchTime > 0) {
                        _targetArrow.setSize(vec.scaled2(_targetArrowSize, 1 + (_targetArrowSwitchScale - 1) * animationProgress));
                    } else {
                        _targetArrow.setSize(_targetArrowSize);
                    }
                } else {
                    _targetArrow.hide();
                }
                // target info panel
                _targetInfoBackground.applyLayout(_targetInfoBackgroundLayout, canvas.width, canvas.height);
                _targetInfoBackground.show();
                // target view
                hullIntegrity = target.getHullIntegrity();
                _targetViewItemColor = (hullIntegrity > 0.5) ?
                        utils.getMixedColor(
                                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_TARGET_ITEM_HALF_INTEGRITY_COLOR),
                                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_TARGET_ITEM_FULL_INTEGRITY_COLOR),
                                (hullIntegrity - 0.5) * 2) :
                        utils.getMixedColor(
                                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_TARGET_ITEM_ZERO_INTEGRITY_COLOR),
                                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_TARGET_ITEM_HALF_INTEGRITY_COLOR),
                                hullIntegrity * 2);
                if (_targetViewItem !== target) {
                    _targetScene.clearNodes();
                    _targetViewItem = target;
                    _targetViewItem.addToScene(_targetScene, graphics.getMaxLoadedLOD(), true, {weapons: true}, {
                        shaderName: config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_TARGET_ITEM_SHADER),
                        positionMatrix: mat.translation4(0, 0, 0),
                        orientationMatrix: mat.identity4()
                    }, function (model) {
                        model.setUniformValueFunction(renderableObjects.UNIFORM_COLOR_NAME, function () {
                            return _targetViewItemColor;
                        });
                        _targetScene.getCamera().moveToPosition([0, 0, 2 * model.getScaledSize()], 0);
                    });
                }
                _targetScene.setRelativeViewport(
                        _targetViewLayout.getPositiveLeft(canvas.width, canvas.height),
                        _targetViewLayout.getPositiveBottom(canvas.width, canvas.height),
                        _targetViewLayout.getPositiveWidth(canvas.width, canvas.height),
                        _targetViewLayout.getPositiveHeight(canvas.width, canvas.height));
                // target hull integrity bar
                _targetHullIntegrityBar.clipX(0, hullIntegrity);
                _targetHullIntegrityBar.applyLayout(_targetHullIntegrityBarLayout, canvas.width, canvas.height);
                _targetHullIntegrityBar.show();
                // target info texts
                targetInfoTextColor = targetIsHostile ?
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).colors.hostile :
                        config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_TEXT).colors.friendly;
                _targetInfoNameText.setColor(targetInfoTextColor);
                _targetInfoNameText.setText(target.getDisplayName() || strings.get(strings.BATTLE.HUD_SPACECRAFT_NAME_UNKNOWN));
                _targetInfoTeamText.setColor(targetInfoTextColor);
                _targetInfoTeamText.setText(target.getTeam() ? target.getTeam().getDisplayName() : strings.get(strings.BATTLE.HUD_TEAM_UNKNOWN));
                _targetInfoClassText.setColor(targetInfoTextColor);
                _targetInfoClassText.setText(target.getClass().getDisplayName());
                _targetInfoDistanceText.setColor(targetInfoTextColor);
                _targetInfoDistanceText.setText(strings.get(strings.BATTLE.HUD_DISTANCE) + ": " + utils.getLengthString(distance));
                _targetInfoVelocityText.setColor(targetInfoTextColor);
                _targetInfoVelocityText.setText(strings.get(strings.BATTLE.HUD_VELOCITY) + ": " + vec.length3(mat.translationVector3(target.getVelocityMatrix())).toFixed() + " m/s");
                _targetInfoTextLayer.show();
                // .....................................................................................................
                // target integrity quick view bar
                if (isInAimingView) {
                    _targetHullIntegrityQuickViewBar.clipX(0.5 - hullIntegrity / 2, 0.5 + hullIntegrity / 2);
                    _targetHullIntegrityQuickViewBar.applyLayout(_targetHullIntegrityQuickViewBarLayout, canvas.width, canvas.height);
                    // target hull integrity decrease animation (color change of the filled portion)
                    if (targetSwitched) {
                        _targetHullIntegrity = hullIntegrity;
                        _targetHullIntegrityDecreaseTime = 0;
                        animationProgress = 0;
                    } else if (hullIntegrity < _targetHullIntegrity) {
                        _targetHullIntegrity = hullIntegrity;
                        _targetHullIntegrityDecreaseTime = _hudTargetHullIntegrityDecreaseAnimationDuration;
                        animationProgress = 1;
                    } else if (_targetHullIntegrityDecreaseTime > 0) {
                        _targetHullIntegrityDecreaseTime -= dt;
                        animationProgress = _targetHullIntegrityDecreaseTime / _hudTargetHullIntegrityDecreaseAnimationDuration;
                    }
                    filledColor = targetIsHostile ?
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.hostileFilled :
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.friendlyFilled;
                    emptyColor = targetIsHostile ?
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.hostileEmpty :
                            config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.friendlyEmpty;

                    if (_targetHullIntegrityDecreaseTime > 0) {
                        _targetHullIntegrityQuickViewBar.setColor(utils.getMixedColor(
                                filledColor,
                                config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).colors.filledWhenDecreasing,
                                animationProgress));
                    } else {
                        _targetHullIntegrityQuickViewBar.setColor(filledColor);
                    }
                    _targetHullIntegrityQuickViewBar.setClipColor(emptyColor);
                    _targetHullIntegrityQuickViewBar.show();
                } else {
                    _targetHullIntegrityQuickViewBar.hide();
                }
            } else {
                // if there is no target
                _targetInfoBackground.hide();
                _targetIndicator.hide();
                _aimAssistIndicator.hide();
                for (i = 0; i < _weaponImpactIndicators.length; i++) {
                    _weaponImpactIndicators[i].hide();
                }
                _targetArrow.hide();
                if (_targetViewItem) {
                    _targetScene.clearNodes();
                    _targetViewItem = null;
                }
                _targetHullIntegrityBar.hide();
                _targetInfoTextLayer.hide();
                _targetHullIntegrityQuickViewBar.hide();
            }
            _battleScene.showUI();
        } else {
            // if there is no followed spacecraft
            if (_isHUDVisible) {
                _bigHeaderText.show();
            } else {
                _bigHeaderText.hide();
            }
            _subheaderText.hide();
            _scoreText.hide();
            _battleScene.hideUI();
            _targetScene.clearNodes();
            _targetViewItem = null;
            _targetInfoTextLayer.hide();
            _speedTextLayer.hide();
            _flightModeIndicatorTextLayer.hide();
            _objectivesTextLayer.hide();
        }
    };
    /**
     * @override
     * @param {Number} dt
     */
    BattleScreen.prototype._render = function (dt) {
        var
                /**@type Boolean*/ victory, isTeamMission, isRecord,
                /**@type Spacecraft*/ craft,
                /**@type Number*/ baseScore, hitRatio, hullIntegrityBonus, teamSurvival, teamSurvivalBonus, score;
        // if we are using the RequestAnimationFrame API for the rendering loop, then the simulation
        // is performed right before each render and not in a separate loop for best performance
        if (_simulationLoop === LOOP_REQUESTANIMFRAME) {
            _simulationLoopFunction();
        }
        if (_battleScene) {
            this._updateHUD(dt);
        }
        screens.HTMLScreenWithCanvases.prototype._render.call(this, dt);
        if (_battleScene) {
            if (application.isDebugVersion()) {
                this._stats.setContent(
                        missions.getDebugInfo() + "<br/>" +
                        sceneGraph.getDebugInfo() + "<br/>" +
                        mat.getMatrixCount() + " <br/>" +
                        this.getFPS() + "<br/>" +
                        _battleScene.getNumberOfDrawnTriangles());
                mat.clearMatrixCount();
            } else {
                this._stats.setContent(this.getFPS());
            }
        }
        // displaying the victory or defeat message
        if ((_simulationLoop !== LOOP_CANCELED)) {
            if (!_demoMode) {
                craft = _mission.getPilotedSpacecraft();
                if (craft && craft.isAlive() && craft.isAway()) {
                    victory = !_mission.isLost() && _mission.isWon();
                    missions.getMissionDescriptor(_mission.getName()).increasePlaythroughCount(victory);
                    hitRatio = craft.getHitRatio();
                    if (victory) {
                        // calculating score from base score and bonuses
                        isTeamMission = craft.getTeam().getInitialCount() > 1;
                        baseScore = Math.round(craft.getScore());
                        hullIntegrityBonus = Math.round(craft.getHullIntegrity() * (isTeamMission ?
                                config.getSetting(config.BATTLE_SETTINGS.SCORE_BONUS_FOR_HULL_INTEGRITY_TEAM) :
                                config.getSetting(config.BATTLE_SETTINGS.SCORE_BONUS_FOR_HULL_INTEGRITY)));
                        if (isTeamMission) {
                            teamSurvival = (_mission.getSpacecraftCountForTeam(craft.getTeam()) - 1) / (craft.getTeam().getInitialCount() - 1);
                            teamSurvivalBonus = Math.round(teamSurvival * config.getSetting(config.BATTLE_SETTINGS.SCORE_BONUS_FOR_TEAM_SURVIVAL));
                        }
                        score = Math.round(baseScore * (1 + hitRatio)) + hullIntegrityBonus + (isTeamMission ? teamSurvivalBonus : 0);
                        isRecord = missions.getMissionDescriptor(_mission.getName()).updateBestScore(score);
                    }
                    game.getScreen(armadaScreens.DEBRIEFING_SCREEN_NAME).setData({
                        victory: victory,
                        survived: true,
                        leftEarly: !victory && !_mission.isLost(),
                        score: score || 0,
                        isRecord: isRecord,
                        elapsedTime: _elapsedTime,
                        kills: craft ? craft.getKills() : 0,
                        damageDealt: craft ? craft.getDamageDealt() : 0,
                        baseScore: baseScore || 0,
                        hitRatio: hitRatio,
                        hitRatioBonus: Math.round((baseScore || 0) * hitRatio),
                        hullIntegrity: craft.getHullIntegrity(),
                        hullIntegrityBonus: hullIntegrityBonus,
                        teamSurvival: teamSurvival,
                        teamSurvivalBonus: teamSurvivalBonus
                    });
                    game.setScreen(armadaScreens.DEBRIEFING_SCREEN_NAME);
                    return;
                }
                // we wait a little after the state changes to victory or defeat so that incoming projectiles destroying the player's ship
                // right after it destroyed the last enemy can change the state from victory to defeat
                if (!_gameStateChanged) {
                    if (_mission && (_mission.isWon() || _mission.isLost())) {
                        _gameStateChanged = true;
                        _timeSinceGameStateChanged = 0;
                    }
                } else if (!_gameStateShown) {
                    _timeSinceGameStateChanged += dt;
                    if (_timeSinceGameStateChanged > config.getSetting(config.BATTLE_SETTINGS.GAME_STATE_DISPLAY_DELAY)) {
                        victory = !_mission.isLost();
                        this.showMessage(utils.formatString(strings.get(victory ? strings.BATTLE.MESSAGE_VICTORY : (craft ? strings.BATTLE.MESSAGE_FAIL : strings.BATTLE.MESSAGE_DEFEAT)), {
                            jumpKey: _getJumpKeyHTMLString()
                        }));
                        _gameStateShown = true;
                        audio.playMusic(
                                (victory ? VICTORY_THEME : DEFEAT_THEME),
                                (victory ? AMBIENT_THEME : null),
                                config.getSetting(config.BATTLE_SETTINGS.END_THEME_CROSSFADE_DURATION));
                    }
                }
            } else {
                if (!_gameStateChanged) {
                    if (_mission && _mission.noHostilesPresent()) {
                        _gameStateChanged = true;
                        _gameStateShown = true;
                        audio.playMusic(AMBIENT_THEME);
                    }
                }
            }
        }
    };
    /**
     * @typedef {Object} BattleScreen~BattleParams
     * @property {String} [missionSourceFilename]
     * @property {Boolean} [demoMode] If true, AIs are added to all spacecrafts and the piloted spacecraft is not set, when loading the mission.
     * @property {Boolean} [restart]
     */
    /**
     * Loads the specified mission description file and sets a callback to create a new game-logic model and scene for the simulated battle
     * based on the mission description and current settings
     * @param {BattleScreen~BattleParams} [params]
     */
    BattleScreen.prototype.startNewBattle = function (params) {
        var
                loadingStartTime = performance.now(),
                canvas = this.getScreenCanvas(BATTLE_CANVAS_ID).getCanvasElement();
        params = params || {};
        _gameStateChanged = false;
        _gameStateShown = false;
        if (params.restart) {
            this.pauseBattle();
        }
        if (params.missionSourceFilename !== undefined) {
            _missionSourceFilename = params.missionSourceFilename;
        }
        if (params.demoMode !== undefined) {
            _demoMode = params.demoMode;
        }
        _clearData();
        document.body.classList.add("wait");
        this._loadingBox.show();
        this.resizeCanvases();
        control.setScreenCenter(
                canvas.width / 2,
                canvas.height / 2);
        this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_LOADING_MISSION), 0);
        missions.requestMission(_missionSourceFilename, _demoMode, function (createdMission) {
            _mission = createdMission;
            this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_ADDING_RANDOM_ELEMENTS), LOADING_RANDOM_ITEMS_PROGRESS);
            _mission.addRandomShips(undefined, _demoMode);
            // for missions that are already won or lost at the very beginning (no enemies / controlled craft), we do not display the
            // victory / defeat message
            if ((!_demoMode && (_mission.isWon() || _mission.isLost())) || (_demoMode && _mission.noHostilesPresent())) {
                _gameStateShown = true;
                if (!_demoMode) {
                    missions.getMissionDescriptor(_mission.getName()).increasePlaythroughCount(true);
                }
            }
            this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_BUILDING_SCENE), LOADING_BUILDING_SCENE_PROGRESS);
            if (graphics.shouldUseShadowMapping()) {
                graphics.getShadowMappingShader();
            }
            _battleScene = new sceneGraph.Scene(
                    0, 0, 1, 1,
                    true, [true, true, true, true],
                    [0, 0, 0, 1], true,
                    graphics.getLODContext(),
                    graphics.getMaxDirLights(),
                    graphics.getMaxPointLights(),
                    graphics.getMaxSpotLights(),
                    {
                        useVerticalValues: config.getSetting(config.GENERAL_SETTINGS.USE_VERTICAL_CAMERA_VALUES),
                        viewDistance: config.getSetting(config.BATTLE_SETTINGS.VIEW_DISTANCE),
                        fov: INITIAL_CAMERA_FOV,
                        span: INITIAL_CAMERA_SPAN,
                        transitionDuration: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_DURATION),
                        transitionStyle: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_STYLE)
                    });
            _targetScene = new sceneGraph.Scene(
                    _targetViewLayout.getPositiveLeft(canvas.width, canvas.height),
                    _targetViewLayout.getPositiveBottom(canvas.width, canvas.height),
                    _targetViewLayout.getPositiveWidth(canvas.width, canvas.height),
                    _targetViewLayout.getPositiveHeight(canvas.width, canvas.height),
                    false, [true, true, true, true],
                    [0, 0, 0, 0], true,
                    graphics.getLODContext(),
                    0,
                    0,
                    0,
                    {
                        useVerticalValues: config.getSetting(config.GENERAL_SETTINGS.USE_VERTICAL_CAMERA_VALUES),
                        viewDistance: config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_VIEW_DISTANCE),
                        fov: config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_FOV),
                        span: config.getSetting(config.CAMERA_SETTINGS.DEFAULT_SPAN),
                        transitionDuration: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_DURATION),
                        transitionStyle: config.getSetting(config.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_STYLE)
                    });
            _mission.addToScene(_battleScene, _targetScene);
            _addHUDToScene();
            this._addUITexts();
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.AMBIENT_MUSIC), AMBIENT_THEME, true);
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.ANTICIPATION_MUSIC), ANTICIPATION_THEME, true);
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.COMBAT_MUSIC), COMBAT_THEME, true);
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.VICTORY_MUSIC), VICTORY_THEME, false);
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.DEFEAT_MUSIC), DEFEAT_THEME, false);
            audio.initMusic(config.getSetting(config.BATTLE_SETTINGS.DEBRIEFING_MUSIC), armadaScreens.DEBRIEFING_THEME, true);
            control.getController(control.GENERAL_CONTROLLER_NAME).setMission(_mission);
            control.getController(control.GENERAL_CONTROLLER_NAME).setBattle(_battle);
            control.getController(control.CAMERA_CONTROLLER_NAME).setControlledCamera(_battleScene.getCamera());
            this._updateLoadingStatus(strings.get(strings.LOADING.RESOURCES_START), LOADING_RESOURCES_START_PROGRESS);
            resources.executeOnResourceLoad(this._updateLoadingBoxForResourceLoad.bind(this));
            resources.executeWhenReady(function () {
                _battleScene.setShadowMapping(graphics.getShadowMappingSettings());
                this._updateLoadingStatus(strings.get(strings.LOADING.INIT_WEBGL), LOADING_INIT_WEBGL_PROGRESS);
                utils.executeAsync(function () {
                    this.setAntialiasing(graphics.getAntialiasing());
                    this.setFiltering(graphics.getFiltering());
                    this.clearSceneCanvasBindings();
                    this.bindSceneToCanvas(_battleScene, this.getScreenCanvas(BATTLE_CANVAS_ID));
                    this.bindSceneToCanvas(_targetScene, this.getScreenCanvas(BATTLE_CANVAS_ID));
                    _targetScene.clearNodes();
                    this._updateLoadingStatus(strings.get(strings.LOADING.READY), 100);
                    application.log("Game data loaded in " + ((performance.now() - loadingStartTime) / 1000).toFixed(3) + " seconds!", 1);
                    _smallHeaderText.setText(strings.get(strings.BATTLE.DEVELOPMENT_VERSION_NOTICE), {version: application.getVersion()});
                    document.body.classList.remove("wait");
                    control.switchToSpectatorMode(false, true);
                    this.setHeaderContent(strings.get(strings.MISSION.PREFIX, utils.getFilenameWithoutExtension(_missionSourceFilename) + strings.MISSION.NAME_SUFFIX.name));
                    _battleCursor = document.body.style.cursor;
                    this.showMessage(utils.formatString(strings.get(strings.BATTLE.MESSAGE_READY), {
                        menuKey: _getMenuKeyHTMLString()
                    }));
                    _mission.applyToSpacecrafts(function (spacecraft) {
                        spacecraft.setOnFired(_handleSpacecraftFired);
                    });
                    this._loadingBox.hide();
                    showHUD();
                    this.startRenderLoop(1000 / config.getSetting(config.BATTLE_SETTINGS.RENDER_FPS));
                    _elapsedTime = 0;
                    _timeSinceLastFire = 0;
                    audio.playMusic(_gameStateShown ? AMBIENT_THEME : ANTICIPATION_THEME);
                }.bind(this));
            }.bind(this));
            resources.requestResourceLoad();
        }.bind(this));
    };
    // -------------------------------------------------------------------------
    // Caching frequently needed setting values
    config.executeWhenReady(function () {
        // hud
        _centerCrosshairScaleMode = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.CENTER_CROSSHAIR).scaleMode;
        _speedTargetIndicatorSize = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_TARGET_INDICATOR).size;
        _targetViewLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_VIEW_LAYOUT));
        _targetInfoBackgroundLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INFO_BACKGROUND).layout);
        _targetHullIntegrityBarLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_BAR).layout);
        _speedBarLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.SPEED_BAR).layout);
        _hullIntegrityBarLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_BAR).layout);
        _flightModeIndicatorBackgroundLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.FLIGHT_MODE_INDICATOR_BACKGROUND).layout);
        _objectivesBackgroundLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.OBJECTIVES_BACKGROUND).layout);
        _hudTargetSwitchAnimationDuration = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_SWITCH_ANIMATION_DURATION);
        _hudHullIntegrityDecreaseAnimationDuration = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.HULL_INTEGRITY_DECREASE_ANIMATION_DURATION);
        _hudTargetHullIntegrityDecreaseAnimationDuration = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_DECREASE_ANIMATION_DURATION);
        _targetIndicatorSize = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR).size;
        _targetIndicatorSwitchScale = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_INDICATOR_SWITCH_SCALE);
        _targetArrowSize = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW).size;
        _targetArrowSwitchScale = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_ARROW_SWITCH_SCALE);
        _weaponImpactIndicatorSize = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR).size;
        _weaponImpactIndicatorSwitchScale = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.WEAPON_IMPACT_INDICATOR_SWITCH_SCALE);
        _driftArrowMinSpeed = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW_MIN_SPEED);
        _driftArrowMaxSpeedFactor = config.getHUDSetting(config.BATTLE_SETTINGS.HUD.DRIFT_ARROW_MAX_SPEED_FACTOR);
        _targetHullIntegrityQuickViewBarLayout = new screens.ClipSpaceLayout(config.getHUDSetting(config.BATTLE_SETTINGS.HUD.TARGET_HULL_INTEGRITY_QUICK_VIEW_BAR).layout);
        // music
        _combatThemeDurationAfterFire = config.getSetting(config.BATTLE_SETTINGS.COMBAT_THEME_DURATION_AFTER_FIRE) * 1000;
    });
    // -------------------------------------------------------------------------
    // The public interface of the module
    _battle.battleScreen = new BattleScreen();
    _battle.stopTime = stopTime;
    _battle.resumeTime = resumeTime;
    _battle.toggleTime = toggleTime;
    _battle.pauseBattle = _battle.battleScreen.pauseBattle.bind(_battle.battleScreen);
    _battle.resumeBattle = _battle.battleScreen.resumeBattle.bind(_battle.battleScreen);
    _battle.showHUD = showHUD;
    _battle.hideHUD = hideHUD;
    _battle.toggleHUDVisibility = toggleHUDVisibility;
    return _battle;
});