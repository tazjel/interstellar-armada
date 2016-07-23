/**
 * Copyright 2016 Krisztián Nagy
 * @file Contains the common constants accessible to all screens of the Interstellar Armada game.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 1.0
 */

/*global define */

define(function () {
    "use strict";
    // constants to be accessible to all screens
    return {
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
        MENU_BUTTON_SELECTED_CLASS_NAME: "selected",
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
    };
});