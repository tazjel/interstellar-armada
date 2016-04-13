/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file This module manages and provides the Battle screen of the Interstellar Armada game.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 2.0
 */

/*jslint nomen: true, white: true*/
/*global define, document, setInterval, clearInterval, window, performance */

/**
 * @param utils Used for string formatting, async calls.
 * @param vec Used for vector operation for the HUD elements.
 * @param mat Used for matrix operation for the HUD elements, displaying matrix stats and orienting random ships.
 * @param application Used for displaying errors and logging.
 * @param components Used for the components of the screen (e.g. loading box)
 * @param screens The battle screen is a HTMLScreenWithCanvases.
 * @param budaScene Used for creating the battle scene and the nodes for the HUD elements.
 * @param resources Used for accessing the resources for the HUD and for requesting the loading of reasourcing and setting callback for when they are ready.
 * @param strings Used for translation support.
 * @param armadaScreens Used for common screen constants.
 * @param graphics Used for accessing graphics settings.
 * @param classes Used for HUD elements for convenient acquiry of their resources.
 * @param logic Used for creating the Level object, accessing settings and enums.
 * @param control Used for global game control functions.
 */
define([
    "utils/utils",
    "utils/vectors",
    "utils/matrices",
    "modules/application",
    "modules/components",
    "modules/screens",
    "modules/buda-scene",
    "modules/graphics-resources",
    "armada/strings",
    "armada/screens/shared",
    "armada/graphics",
    "armada/classes",
    "armada/logic",
    "armada/control",
    "utils/polyfill"
], function (utils, vec, mat, application, components, screens, budaScene, resources, strings, armadaScreens, graphics, classes, logic, control) {
    "use strict";
    var
            // ------------------------------------------------------------------------------
            // constants
            STATS_PARAGRAPH_ID = "stats",
            UI_PARAGRAPH_ID = "ui",
            SMALL_HEADER_ID = "smallHeader",
            BIG_HEADER_ID = "bigHeader",
            DEBUG_LABEL_PARAGRAPH_ID = "debugLabel",
            LOADING_BOX_ID = "loadingBox",
            INFO_BOX_ID = "infoBox",
            BATTLE_CANVAS_ID = "battleCanvas",
            LOOP_CANCELED = -1,
            LOOP_REQUESTANIMFRAME = -2,
            TARGET_INFO_SEPARATOR = "---------------",
            LOADING_RANDOM_ITEMS_PROGRESS = 5,
            LOADING_BUILDING_SCENE_PROGRESS = 10,
            LOADING_RESOURCES_START_PROGRESS = 20,
            LOADING_RESOURCE_PROGRESS = 60,
            LOADING_INIT_WEBGL_PROGRESS = LOADING_RESOURCES_START_PROGRESS + LOADING_RESOURCE_PROGRESS,
            /**
             * When creating the battle scene, the camera will be created with this FOV, but it will be immediately overwritten by the 
             * FOV set for the first scene view of the loaded level, therefore no point in making this settable.
             * @type Number
             */
            INITIAL_CAMERA_FOV = 40,
            INITIAL_CAMERA_SPAN = 0.2,
            HUD_ELEMENT_CLASS_NAME = "hudElementClass",
            HUD_ELEMENT_MODEL_NAME = "squareModel",
            UI_2D_SHADER_NAME = "ui2d",
            UI_3D_SHADER_NAME = "ui3d",
            // ------------------------------------------------------------------------------
            // private variables
            /**
             * The level object storing and simulating the game-logic model of the battle
             * @type Level
             */
            _level,
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
             * This HUD element represents a crosshair that is always shown at the center of the screen when a spacecraft is controlled.
             * @type HUDElement
             */
            _centerCrosshair,
            /**
             * This HUD element represents a reticle that is shown at the location of the target of the controlled spacecraft, if that exists.
             * @type HUDElement
             */
            _targetIndicator,
            /**
             * This HUD element represents a crosshair that is shown in the line of fire of the controlled ship, at the same distance as its
             * current target.
             * @type HUDElement
             */
            _targetCrosshair,
            /**
             * This HUD element represents an arrow that is shown point in the direction of the current target, if it is not visible on the
             * screen.
             * @type HUDElement
             */
            _targetArrow,
            /**
             * The object that will be returned as this module
             * @type Battle
             */
            _battle = {};
    // ------------------------------------------------------------------------------
    // private functions
    /**
     * Executes one simulation (and control) step for the battle.
     */
    function _simulationLoopFunction() {
        if (_simulationLoop !== LOOP_CANCELED) {
            var curDate = performance.now();
            control.control(curDate - _prevDate);
            if (!_isTimeStopped) {
                _level.tick(curDate - _prevDate);
            }
            _prevDate = curDate;
        }
    }
    /**
     * Removes the stored renferences to the logic and graphical models of the battle.
     */
    function _clearData() {
        if (_level) {
            _level.destroy();
        }
        _level = null;
        if (_battleScene) {
            _battleScene.clearNodes();
            _battleScene.clearPointLights();
        }
        _battleScene = null;
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
     * Pauses the battle by canceling all control and simulation (e.g. for when a menu is displayed)
     */
    function pauseBattle() {
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
    }
    /**
     * Resumes the simulation and control of the battle
     */
    function resumeBattle() {
        document.body.style.cursor = _battleCursor || 'default';
        if (_simulationLoop === LOOP_CANCELED) {
            _prevDate = performance.now();
            if (_battleScene) {
                if (!_isTimeStopped) {
                    _battleScene.setShouldAnimate(true);
                }
                _battleScene.setShouldUpdateCamera(true);
            }
            if (logic.getSetting(logic.GENERAL_SETTINGS.USE_REQUEST_ANIM_FRAME)) {
                _simulationLoop = LOOP_REQUESTANIMFRAME;
            } else {
                _simulationLoop = setInterval(_simulationLoopFunction, 1000 / (logic.getSetting(logic.BATTLE_SETTINGS.SIMULATION_STEPS_PER_SECOND)));
            }
            control.startListening();
        } else {
            application.showError(
                    "Trying to resume simulation while it is already going on!",
                    application.ErrorSeverity.MINOR,
                    "No action was taken, to avoid double-running the simulation.");
        }
    }
    // ##############################################################################
    /**
     * @class Can be used to represent an element of the HUD, for which it can create an appropriate UIElement and add it to the battle scene.
     * @param {String} shaderName The name of the shader to use for rendering this element.
     * @param {String} textureName The name of the common texture resource to use for this element.
     * @param {Number[2]|Number[3]} position The 2D or 3D (starting) position of the element (depending on the shader used)
     * @param {Number[2]} size The 2D size factor of the element to scale it.
     * @param {Number[4]} color An RGBA color for the element it can be modulated with.
     */
    function HUDElement(shaderName, textureName, position, size, color) {
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
         * The 2D size factor of the element to scale it.
         * @type Number[2]
         */
        this._size = size;
        /**
         * An RGBA color for the element it can be modulated with.
         * @type Number[4]
         */
        this._color = color;
        /**
         * The current angle for the element to be rotated by in 2D, in radians.
         * @type Number
         */
        this._angle = 0;
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
        this._class.acquireResources({model: resources.getModel(HUD_ELEMENT_MODEL_NAME)});
    };
    /**
     * Creates and stores a new visual model to represent this HUD element. Automatically called when the element is added to a scene.
     */
    HUDElement.prototype._createVisualModel = function () {
        this._visualModel = new budaScene.UIElement(
                this._class.getModel(),
                this._class.getShader(),
                this._class.getTexturesOfTypes(this._class.getShader().getTextureTypes(), graphics.getTextureQualityPreferenceList()),
                this._position,
                this._size,
                this._color,
                Math.degrees(this._angle));
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
     * Sets a new angle for this HUD element and its visual representation, if that exists.
     * @param {Number} value The new angle, in radians
     */
    HUDElement.prototype.setAngle = function (value) {
        this._angle = value;
        if (this._visualModel) {
            this._visualModel.setAngle(value);
        }
    };
    // ------------------------------------------------------------------------------
    // public functions
    /**
     * Creates all HUD elements, marks their resources for loading if they are not loaded yet, and adds their visual models to the scene if
     * they are. If they are not loaded, sets callbacks to add them after the loading has finished.
     */
    function _addUIToScene() {
        // keep the ons with the same shader together for faster rendering
        _centerCrosshair = new HUDElement(
                UI_2D_SHADER_NAME,
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_CENTER_CROSSHAIR_TEXTURE),
                [0, 0],
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_CENTER_CROSSHAIR_SIZE),
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_CENTER_CROSSHAIR_COLOR));
        _centerCrosshair.addToScene(_battleScene);
        _targetArrow = new HUDElement(
                UI_2D_SHADER_NAME,
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_ARROW_TEXTURE),
                [0, 0],
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_ARROW_SIZE),
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_ARROW_COLOR));
        _targetArrow.addToScene(_battleScene);
        _targetIndicator = new HUDElement(
                UI_3D_SHADER_NAME,
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_INDICATOR_TEXTURE),
                [0, 0, 0],
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_INDICATOR_SIZE),
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_INDICATOR_COLOR));
        _targetIndicator.addToScene(_battleScene);
        _targetCrosshair = new HUDElement(
                UI_3D_SHADER_NAME,
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_CROSSHAIR_TEXTURE),
                [0, 0, 0],
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_CROSSHAIR_SIZE),
                logic.getSetting(logic.BATTLE_SETTINGS.HUD_TARGET_CROSSHAIR_COLOR));
        _targetCrosshair.addToScene(_battleScene);
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
                graphics.getFiltering(),
                logic.getSetting(logic.GENERAL_SETTINGS.USE_REQUEST_ANIM_FRAME));
        /**
         * @type SimpleComponent
         */
        this._stats = this.registerSimpleComponent(STATS_PARAGRAPH_ID);
        /**
         * @type SimpleComponent
         */
        this._ui = this.registerSimpleComponent(UI_PARAGRAPH_ID);
        /**
         * @type SimpleComponent
         */
        this._smallHeader = this.registerSimpleComponent(SMALL_HEADER_ID);
        /**
         * @type SimpleComponent
         */
        this._bigHeader = this.registerSimpleComponent(BIG_HEADER_ID);
        /**
         * @type SimpleComponent
         */
        this._debugLabel = this.registerSimpleComponent(DEBUG_LABEL_PARAGRAPH_ID);
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
                function () {
                    pauseBattle();
                },
                function () {
                    resumeBattle();
                    control.switchToPilotMode(_level.getPilotedSpacecraft());
                }.bind(this),
                strings.INFO_BOX.HEADER.name,
                strings.INFO_BOX.OK_BUTTON.name));
    }
    BattleScreen.prototype = new screens.HTMLScreenWithCanvases();
    BattleScreen.prototype.constructor = BattleScreen;
    /**
     * @override
     */
    BattleScreen.prototype.hide = function () {
        screens.HTMLScreenWithCanvases.prototype.hide.call(this);
        pauseBattle();
        _clearData();
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
     * 
     * @param {String} message
     */
    BattleScreen.prototype.setDebugLabel = function (message) {
        this._debugLabel.setContent(message);
    };
    /**
     * Shows the stats (FPS, draw stats) component.
     */
    BattleScreen.prototype.showStats = function () {
        this._stats.show();
    };
    /**
     * Hides the stats (FPS, draw stats) component.
     */
    BattleScreen.prototype.hideStats = function () {
        this._stats.hide();
    };
    /**
     * Shows the UI (information about controlled spacecraft) component.
     */
    BattleScreen.prototype.showUI = function () {
        this._ui.show();
        if (_battleScene) {
            _battleScene.showUI();
        }
    };
    /**
     * Hides the UI (information about controlled spacecraft) component.
     */
    BattleScreen.prototype.hideUI = function () {
        this._ui.hide();
        if (_battleScene) {
            _battleScene.hideUI();
        }
    };
    /**
     * Shows the headers in the top center of the screen.
     */
    BattleScreen.prototype.showHeaders = function () {
        this._bigHeader.show();
        this._smallHeader.show();
    };
    /**
     * Hides the headers.
     */
    BattleScreen.prototype.hideHeaders = function () {
        this._bigHeader.hide();
        this._smallHeader.hide();
    };
    /**
     * Toggles the visibility of the texts (headers and statistics) on the screen.
     * @returns {undefined}
     */
    BattleScreen.prototype.toggleTextVisibility = function () {
        if (this._bigHeader.isVisible()) {
            this.hideHeaders();
            this.hideStats();
        } else {
            this.showHeaders();
            this.showStats();
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
        this._bigHeader.setContent(content, replacements);
    };
    /**
     * Updates the contents of the UI with information about the currently controlled spacecraft
     */
    BattleScreen.prototype._updateUI = function () {
        var craft = _level ? _level.getPilotedSpacecraft() : null, target, distance, direction, behind, aspect;
        if (craft) {
            target = craft.getTarget();
            // updating the WebGL HUD
            if (target) {
                distance = vec.length3(vec.diff3(target.getVisualModel().getPositionVector(), craft.getVisualModel().getPositionVector()));
                // targeting reticle at the target position
                _targetIndicator.setPosition(mat.translationVector3(target.getVisualModel().getPositionMatrix()));
                _targetIndicator.show();
                // targeting crosshair in the line of fire
                _targetCrosshair.setPosition(vec.sum3(
                        mat.translationVector3(craft.getVisualModel().getPositionMatrix()),
                        vec.scaled3(mat.getRowB43(craft.getVisualModel().getOrientationMatrix()), distance)));
                _targetCrosshair.show();
                // target arrow, if the target is not visible on the screen
                direction = vec.mulVec4Mat4([0.0, 0.0, 0.0, 1.0], mat.prod34(target.getVisualModel().getPositionMatrix(), _battleScene.getCamera().getViewMatrix(), _battleScene.getCamera().getProjectionMatrix()));
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
                    _targetArrow.setPosition(vec.scaled2([direction[0], direction[1] * aspect], 0.3));
                    _targetArrow.setAngle(vec.angle2u([0, 1], direction) * ((direction[0] < 0) ? -1 : 1));
                } else {
                    _targetArrow.hide();
                }
            } else {
                _targetIndicator.hide();
                _targetCrosshair.hide();
                _targetArrow.hide();
            }
            // updating the HTML5 UI
            this._ui.setContent(
                    (target ? (strings.get(strings.BATTLE.HUD_TARGET) + ": " + strings.getSpacecraftClassName(target.getClass()) + " (" + target.getHitpoints() + "/" + target.getClass().getHitpoints() + ")<br/>") : "") +
                    (target ? (strings.get(strings.BATTLE.HUD_DISTANCE) + ": " + utils.getLengthString(distance)) +
                            "<br/>" + TARGET_INFO_SEPARATOR + "<br/>" : "") +
                    utils.formatString(strings.get(strings.BATTLE.HUD_VIEW), {
                        view: strings.get(strings.OBJECT_VIEW.PREFIX, _battleScene.getCamera().getConfiguration().getName(), _battleScene.getCamera().getConfiguration().getName())
                    }) + "<br/>" +
                    strings.get(strings.SPACECRAFT_STATS.ARMOR) + ": " + craft.getHitpoints() + "/" + craft.getClass().getHitpoints() + "<br/>" +
                    utils.formatString(strings.get(strings.BATTLE.HUD_FLIGHT_MODE), {
                        flightMode: strings.get(strings.FLIGHT_MODE.PREFIX, craft.getFlightMode(), craft.getFlightMode())
                    }) + "<br/>" +
                    strings.get(strings.BATTLE.HUD_SPEED) + ": " + craft.getRelativeVelocityMatrix()[13].toFixed() +
                    ((craft.getFlightMode() !== logic.FlightMode.FREE) ? (" / " + craft._maneuveringComputer._speedTarget.toFixed()) : ""));
        } else {
            _battleScene.hideUI();
        }
    };
    /**
     * @override
     * @param {Number} dt
     */
    BattleScreen.prototype._render = function (dt) {
        // if we are using the RequestAnimationFrame API for the rendering loop, then the simulation
        // is performed right before each render and not in a separate loop for best performance
        if (_simulationLoop === LOOP_REQUESTANIMFRAME) {
            _simulationLoopFunction();
        }
        if (_battleScene) {
            this._updateUI();
        }
        screens.HTMLScreenWithCanvases.prototype._render.call(this, dt);
        if (_battleScene) {
            if (application.isDebugVersion()) {
                this._stats.setContent(
                        mat.getMatrixCount() + " <br/>" +
                        this.getFPS() + "<br/>" +
                        _battleScene.getNumberOfDrawnTriangles());
                mat.clearMatrixCount();
            } else {
                this._stats.setContent(this.getFPS());
            }
        }
    };
    /**
     * Loads the specified level description file and sets a callback to create a new game-logic model and scene for the simulated battle
     * based on the level description and current settings
     * @param {String} levelSourceFilename
     */
    BattleScreen.prototype.startNewBattle = function (levelSourceFilename) {
        var
                loadingStartTime = performance.now(),
                canvas = this.getScreenCanvas(BATTLE_CANVAS_ID).getCanvasElement();
        _clearData();
        document.body.classList.add("wait");
        this.hideStats();
        this._loadingBox.show();
        this.resizeCanvases();
        control.setScreenCenter(
                canvas.width / 2,
                canvas.height / 2);
        _level = new logic.Level();
        this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_LOADING_LEVEL), 0);
        _level.requestLoadFromFile(levelSourceFilename, function () {
            this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_ADDING_RANDOM_ELEMENTS), LOADING_RANDOM_ITEMS_PROGRESS);
            _level.addRandomShips(
                    logic.getSetting(logic.BATTLE_SETTINGS.RANDOM_SHIPS),
                    logic.getSetting(logic.BATTLE_SETTINGS.RANDOM_SHIPS_MAP_SIZE),
                    mat.rotation4([0, 0, 1], Math.radians(logic.getSetting(logic.BATTLE_SETTINGS.RANDOM_SHIPS_HEADING_ANGLE))),
                    false, false, logic.getSetting(logic.BATTLE_SETTINGS.RANDOM_SHIPS_RANDOM_HEADING));
            this._updateLoadingStatus(strings.get(strings.BATTLE.LOADING_BOX_BUILDING_SCENE), LOADING_BUILDING_SCENE_PROGRESS);
            if (graphics.shouldUseShadowMapping()) {
                graphics.getShadowMappingShader();
            }
            _battleScene = new budaScene.Scene(
                    0, 0, canvas.width, canvas.height,
                    true, [true, true, true, true],
                    [0, 0, 0, 1], true,
                    graphics.getLODContext(),
                    graphics.getMaxPointLights(),
                    graphics.getMaxSpotLights(),
                    {
                        useVerticalValues: logic.getSetting(logic.GENERAL_SETTINGS.USE_VERTICAL_CAMERA_VALUES),
                        viewDistance: logic.getSetting(logic.BATTLE_SETTINGS.VIEW_DISTANCE),
                        fov: INITIAL_CAMERA_FOV,
                        span: INITIAL_CAMERA_SPAN,
                        transitionDuration: logic.getSetting(logic.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_DURATION),
                        transitionStyle: logic.getSetting(logic.BATTLE_SETTINGS.CAMERA_DEFAULT_TRANSITION_STYLE)
                    });
            this.hideUI();
            _level.addToScene(_battleScene);
            _addUIToScene();
            control.getController(control.GENERAL_CONTROLLER_NAME).setLevel(_level);
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
                    this._updateLoadingStatus(strings.get(strings.LOADING.READY), 100);
                    application.log("Game data loaded in " + ((performance.now() - loadingStartTime) / 1000).toFixed(3) + " seconds!", 1);
                    this._smallHeader.setContent(strings.get(strings.BATTLE.DEVELOPMENT_VERSION_NOTICE), {version: application.getVersion()});
                    document.body.classList.remove("wait");
                    control.switchToSpectatorMode(false);
                    _battleCursor = document.body.style.cursor;
                    this.showMessage(utils.formatString(strings.get(strings.BATTLE.MESSAGE_READY), {
                        menuKey: "<span class='highlightedText'>" + control.getInputInterpreter(control.KEYBOARD_NAME).getControlStringForAction("quit") + "</span>"
                    }));
                    this._loadingBox.hide();
                    this.showStats();
                    this.startRenderLoop(1000 / logic.getSetting(logic.BATTLE_SETTINGS.RENDER_FPS));
                }.bind(this));
            }.bind(this));

            resources.requestResourceLoad();
        }.bind(this));
    };
    // -------------------------------------------------------------------------
    // The public interface of the module
    _battle.battleScreen = new BattleScreen();
    _battle.stopTime = stopTime;
    _battle.resumeTime = resumeTime;
    _battle.toggleTime = toggleTime;
    _battle.pauseBattle = pauseBattle;
    _battle.resumeBattle = resumeBattle;
    return _battle;
});