/**
 * Copyright 2016 Krisztián Nagy
 * @file Contains the common constants and functions accessible to all screens of the Interstellar Armada game.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 1.0
 */

/*jslint nomen: true, white: true */
/*global define */

/**
 * 
 * @param resources Used to load and access the sound effects for buttons
 * @param components Used for constants (CSS class names)
 * @param config Used to access which sound effects and music to load
 * @param audio Used to initialize music
 */
define([
    "modules/media-resources",
    "modules/components",
    "armada/configuration",
    "armada/audio"
], function (resources, components, config, audio) {
    "use strict";
    var
            exports = {
                // ------------------------------------------------------------------------------
                // Constants
                // music
                MENU_THEME: "menu",
                // components
                SELECTOR_SOURCE: "selector.html",
                SELECTOR_CSS: "selector.css",
                SLIDER_SOURCE: "slider.html",
                SLIDER_CSS: "slider.css",
                LOADING_BOX_SOURCE: "loadingbox.html",
                LOADING_BOX_CSS: "loadingbox.css",
                INFO_BOX_SOURCE: "infobox.html",
                INFO_BOX_CSS: "infobox.css",
                MENU_COMPONENT_SOURCE: "menucomponent.html",
                MENU_CLASS_NAME: "menu",
                MENU_BUTTON_CLASS_NAME: "button",
                MENU_BUTTON_CONTAINER_CLASS_NAME: "transparentContainer",
                // general
                SUPERIMPOSE_BACKGROUND_COLOR: [0.25, 0.25, 0.25, 0.5],
                SCREEN_BACKGROUND_CLASS_NAME: "fullScreenFix",
                SCREEN_CONTAINER_CLASS_NAME: "fullScreenContainer",
                // screens
                MAIN_MENU_SCREEN_NAME: "mainMenu",
                MAIN_MENU_SCREEN_SOURCE: "menu.html",
                MAIN_MENU_CONTAINER_ID: "menuContainer",
                LEVEL_MENU_SCREEN_NAME: "levelMenu",
                LEVEL_MENU_SCREEN_SOURCE: "menu.html",
                LEVEL_MENU_CONTAINER_ID: "menuContainer",
                DEMO_LEVEL_MENU_SCREEN_NAME: "demoLevelMenu",
                DEMO_LEVEL_MENU_SCREEN_SOURCE: "menu.html",
                DEMO_LEVEL_MENU_CONTAINER_ID: "menuContainer",
                BATTLE_SCREEN_NAME: "battle",
                BATTLE_SCREEN_SOURCE: "battle.html",
                BATTLE_SCREEN_CSS: "battle.css",
                DATABASE_SCREEN_NAME: "database",
                DATABASE_SCREEN_SOURCE: "database.html",
                DATABASE_SCREEN_CSS: "database.css",
                SETTINGS_SCREEN_NAME: "settings",
                SETTINGS_SCREEN_SOURCE: "menu.html",
                SETTINGS_MENU_CONTAINER_ID: "menuContainer",
                GENERAL_SETTINGS_SCREEN_NAME: "generalSettings",
                GENERAL_SETTINGS_SCREEN_SOURCE: "general-settings.html",
                GRAPHICS_SCREEN_NAME: "graphics",
                GRAPHICS_SCREEN_SOURCE: "graphics.html",
                AUDIO_SCREEN_NAME: "audio",
                AUDIO_SCREEN_SOURCE: "audio.html",
                CONTROLS_SCREEN_NAME: "controls",
                CONTROLS_SCREEN_SOURCE: "controls.html",
                ABOUT_SCREEN_NAME: "about",
                ABOUT_SCREEN_SOURCE: "about.html",
                INGAME_MENU_SCREEN_NAME: "ingameMenu",
                INGAME_MENU_SCREEN_SOURCE: "ingame-menu.html",
                INGAME_MENU_SCREEN_CSS: "ingame-menu.css",
                INGAME_MENU_CONTAINER_ID: "menuContainer"
            },
            // ------------------------------------------------------------------------------
            // Private variables
            /**
             * Stores the sound source that can be used to play the button select sound (played when the player hovers over a button or selects it
             * with the arrow keys)
             * @type SoundSource
             */
            _buttonSelectSound,
            /**
             * Stores the sound source that can be used to play the button click sound (played when the player clicks on or activates an
             * enabled button)
             * @type SoundSource
             */
            _buttonClickSound;
    // ------------------------------------------------------------------------------
    // Public functions
    /**
     * Initiates the loading of the sound effects used on all screens.
     * @param {Function} [callback] If given, this function is executed once all sound effects are loaded
     */
    exports.initAudio = function (callback) {
        var s1, s2;
        s1 = resources.getSoundEffect(config.getSetting(config.GENERAL_SETTINGS.BUTTON_SELECT_SOUND).name);
        s2 = resources.getSoundEffect(config.getSetting(config.GENERAL_SETTINGS.BUTTON_CLICK_SOUND).name);
        audio.initMusic(config.getSetting(config.GENERAL_SETTINGS.MENU_MUSIC), exports.MENU_THEME, true);
        if ((s1 && !s1.isLoaded() && !s1.hasError()) || (s2 && !s2.isLoaded() && !s2.hasError())) {
            resources.executeWhenReady(function () {
                _buttonSelectSound = s1 && s1.createSoundClip(config.getSetting(config.GENERAL_SETTINGS.BUTTON_SELECT_SOUND).volume);
                _buttonClickSound = s2 && s2.createSoundClip(config.getSetting(config.GENERAL_SETTINGS.BUTTON_CLICK_SOUND).volume);
            });
        }
        resources.requestResourceLoad();
        if (callback) {
            resources.executeWhenReady(callback);
        }
    };
    /**
     * Plays the button select sound, if it is loaded.
     * @param {Boolean} [enabled=false] If true, does not play the sound
     */
    exports.playButtonSelectSound = function (enabled) {
        if (_buttonSelectSound && enabled) {
            _buttonSelectSound.play();
        }
    };
    /**
     * Plays the button click sound, if it is loaded.
     * @param {Boolean} [enabled=false] If true, does not play the sound
     */
    exports.playButtonClickSound = function (enabled) {
        if (_buttonClickSound && enabled) {
            _buttonClickSound.play();
        }
    };
    // ------------------------------------------------------------------------------
    // Derived constants
    /**
     * Contains event handlers to play the button click and select sounds for elements with the class "button". Can be used for all screens
     * that contain buttons (but needs to be complemented with additional event handlers if those are needed)
     * @type Object.<String, Object.<String, Function>>
     */
    exports.BUTTON_EVENT_HANDLERS = {
        ".button": {
            mouseenter: function () {
                exports.playButtonSelectSound(!this.classList.contains(components.DISABLED_CLASS_NAME));
            },
            click: function () {
                exports.playButtonClickSound(!this.classList.contains(components.DISABLED_CLASS_NAME));
            }
        }
    };
    /**
     * Contains event handlers for MenuScreen screens to play the button select and click sounds for the menu option buttons
     * @type Object.<String, Function>
     */
    exports.MENU_EVENT_HANDLERS = {
        optionselect: exports.playButtonSelectSound,
        optionclick: exports.playButtonClickSound
    };
    /**
     * A style descriptor containing the CSS class names needed to create a MenuComponent
     * @type MenuComponent~Style
     */
    exports.MENU_STYLE = {
        menuClassName: exports.MENU_CLASS_NAME,
        buttonClassName: exports.MENU_BUTTON_CLASS_NAME,
        buttonContainerClassName: exports.MENU_BUTTON_CONTAINER_CLASS_NAME,
        selectedButtonClassName: components.SELECTED_CLASS_NAME,
        disabledClassName: components.DISABLED_CLASS_NAME
    };
    // ------------------------------------------------------------------------------
    // Public interface of the module
    return exports;
});