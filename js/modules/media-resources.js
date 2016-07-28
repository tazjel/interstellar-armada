/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file Augments the functionality of ResourceManager to provide a customized resource manager class storing various media resources,
 * for which the respective classes are also provided. These classes are based on the classes of ManagedGL and EgomModel.
 * The provided resource manager is ready to use, can load media resource descriptions from a specified JSON file, then mark the 
 * specific resources for loading (e.g. getTexture(params)) and load them when requested.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 1.0
 */

/*jslint nomen: true, plusplus: true, white: true */
/*global define, Image, window */

/**
 * @param utils Used for comparing objects for equality
 * @param types Used for verifying enum values
 * @param application Used for file loading, logging and displaying error messages
 * @param resourceManager This module builds on the functionality of the general resource manager module
 * @param managedGL Provides resource classes that can load and create for ManagedTextures, ManagedCubeMaps and ManagedShaders
 * @param egomModel Provides resource classes that can load and create Egom Models
 * @param audio Used for easy access to the Web Audio API for playing back sound resources
 */
define([
    "utils/utils",
    "utils/types",
    "modules/application",
    "modules/resource-manager",
    "modules/managed-gl",
    "modules/egom-model",
    "modules/audio"
], function (utils, types, application, resourceManager, managedGL, egomModel, audio) {
    "use strict";
    var
            // ------------------------------------------------------------------------------
            // enums
            /**
             * @enum {String}
             * Stores the currently handled shader type values.
             */
            ShaderType = {
                VERTEX: "vertex",
                FRAGMENT: "fragment"
            },
    // ------------------------------------------------------------------------------
    // constants
    /**
     * In the resource description file, texture resources will be initialized from the array with this name
     * @type String
     */
    TEXTURE_ARRAY_NAME = "textures",
            /**
             * In the resource description file, cubemap resources will be initialized from the array with this name
             * @type String
             */
            CUBEMAP_ARRAY_NAME = "cubemaps",
            /**
             * In the resource description file, shader resources will be initialized from the array with this name
             * @type String
             */
            SHADER_ARRAY_NAME = "shaders",
            /**
             * In the resource description file, model resources will be initialized from the array with this name
             * @type String
             */
            MODEL_ARRAY_NAME = "models",
            /**
             * When asked to be loaded from files, texture resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            TEXTURE_FOLDER = "texture",
            /**
             * When asked to be loaded from files, cubemap resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            CUBEMAP_FOLDER = "texture",
            /**
             * When asked to be loaded from files, shader resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            SHADER_FOLDER = "shader",
            /**
             * When asked to be loaded from files, model resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            MODEL_FOLDER = "model",
            /**
             * In the resource description file, sound effect resources will be initialized from the array with this name
             * @type String
             */
            SOUND_EFFECT_ARRAY_NAME = "soundEffects",
            /**
             * When asked to be loaded from files, sound effect resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            SOUND_EFFECT_FOLDER = "soundEffect",
            /**
             * In the resource description file, music resources will be initialized from the array with this name
             * @type String
             */
            MUSIC_ARRAY_NAME = "music",
            /**
             * When asked to be loaded from files, music resources will look for the files in the folder with this ID (not URL)
             * @type String
             */
            MUSIC_FOLDER = "music",
            /**
             * Lines in shader sources starting with this string are treated as include statements referencing another shader source file
             * to be inserted into the source in the place of the line, with the name (path) of the file to be inserted starting after this
             * prefix.
             * @type String
             */
            SHADER_INCLUDE_STATEMENT_PREFIX = '#include "',
            /**
             * When parsing an include statement in a shader source, this suffix at the end of the line of the include statement is not 
             * considered to be the part of the path of the referenced file.
             * @type String
             */
            SHADER_INCLUDE_STATEMENT_SUFFIX = '"',
            /**
             * During the loading of shaders, sources that could not be downloaded will be set to this value to mark that their download
             * has finished (unsuccessfully). They are nulled out at the end of the loading process.
             * @type String
             */
            EMPTY_SHADER_SOURCE = "-",
            // ------------------------------------------------------------------------------
            // module variables
            /**
             * @typedef {Object} ShaderIncludeCacheObject
             * @property {String} source
             * @property {Function[]} onLoad
             */
            /**
             * Stores the texts of the already downloaded shader includes (shader sources that are included in another source) and the 
             * onLoad queues of the ones that being downloaded.
             * @type Object.<String, ShaderIncludeCacheObject>
             */
            _shaderIncludeCache = {},
            /**
             * This media resource manager will be used to load and access the media resources.
             * @type MediaResourceManager
             */
            _resourceManager;
    // freezing enum objects
    Object.freeze(ShaderType);
    // ############################################################################################
    /**
     * @typedef TextureResource~ManagedTextureCacheObject
     * @property {String[]} types
     * @property {String[]} qualityPreferenceList
     * @property {Object.<String, ManagedTexture>} textures
     */
    /**
     * @class
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function TextureResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        /**
         * @type String
         */
        this._basepath = dataJSON.basepath;
        /**
         * @type String
         */
        this._format = dataJSON.format;
        /**
         * @type Boolean
         */
        this._useMipmap = (dataJSON.useMipmap === true);
        /**
         * @type Object.<String, String>
         */
        this._typeSuffixes = dataJSON.typeSuffixes;
        /**
         * @type Object.<String, String>
         */
        this._qualitySuffixes = dataJSON.qualitySuffixes;
        /**
         * @type Number
         */
        this._loadedImages = 0;
        /**
         * @type Number
         */
        this._imagesToLoad = 0;
        /**
         * @type Object.<String, Object.<String, Image>>
         */
        this._images = {};
        /**
         * @type Object.<String, Object.<String, ManagedTexture>>
         */
        this._managedTextures = {};
        /**
         * @type TextureResource~ManagedTextureCacheObject[]
         */
        this._cachedManagedTexturesOfTypes = [];
    }
    TextureResource.prototype = new resourceManager.GenericResource();
    TextureResource.prototype.constructor = TextureResource;
    /**
     * @param {String} type
     * @param {String} quality
     * @returns {String}
     */
    TextureResource.prototype._getPath = function (type, quality) {
        return this._basepath + this._typeSuffixes[type] + this._qualitySuffixes[quality] + "." + this._format;
    };
    /**
     * @param {String} type
     * @param {String} quality
     * @returns {Function}
     */
    TextureResource.prototype._getOnLoadImageFunction = function (type, quality) {
        var path = this._getPath(type, quality);
        return function () {
            this._loadedImages++;
            this._onFilesLoad(this._loadedImages === this._imagesToLoad, {path: path});
        }.bind(this);
    };
    /**
     * Displays an error message for the case when the source file for this texture with the passed name could not be loaded.
     * @param {String} filename
     */
    TextureResource.prototype._handleError = function (filename) {
        application.showError("Could not load texture '" + this._name + "': downloading file '" + filename + "' failed!");
        this._loadedImages++;
        this._onFilesLoad(this._loadedImages === this._imagesToLoad, {path: filename, error: true});
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    TextureResource.prototype.requiresReload = function (params) {
        var requestedTypes, type, requestedQualities, quality;
        if (this.isRequested(params)) {
            return false;
        }
        params = params || {};
        requestedTypes = params.types || this._typeSuffixes;
        requestedQualities = params.qualities || this._qualitySuffixes;
        for (type in requestedTypes) {
            if (requestedTypes.hasOwnProperty(type)) {
                if (!this._images[type]) {
                    return true;
                }
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[type][quality]) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };
    /**
     * @override
     * @param {Object} params
     */
    TextureResource.prototype._requestFiles = function (params) {
        var requestedTypes, type, requestedQualities, quality;
        params = params || {};
        requestedTypes = params.types || this._typeSuffixes;
        requestedQualities = params.qualities || this._qualitySuffixes;
        for (type in requestedTypes) {
            if (requestedTypes.hasOwnProperty(type)) {
                this._images[type] = this._images[type] || {};
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[type][quality]) {
                            this._imagesToLoad++;
                            this._images[type][quality] = new Image();
                            this._images[type][quality].onload = this._getOnLoadImageFunction(type, quality).bind(this);
                            this._images[type][quality].onerror = this._handleError.bind(this, this._getPath(type, quality));
                        }
                    }
                }
            }
        }
        // setting the src property of an Image object will automatically result in an asynchronous
        // request to grab the image source file
        for (type in requestedTypes) {
            if (requestedTypes.hasOwnProperty(type)) {
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[type][quality].src) {
                            this._images[type][quality].src = application.getFileURL(TEXTURE_FOLDER, this._getPath(type, quality));
                        }
                    }
                }
            }
        }
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    TextureResource.prototype._loadData = function (params) {
        if (!params.error) {
            application.log("Texture from file: " + params.path + " has been loaded.", 2);
            return true;
        }
        application.log("Texture from file: " + params.path + " could not be loaded.", 2);
        return false;
    };
    /**
     * @returns {String[]}
     */
    TextureResource.prototype.getTypes = function () {
        var type, textureTypes = [];
        for (type in this._typeSuffixes) {
            if (this._typeSuffixes.hasOwnProperty(type)) {
                textureTypes.push(type);
            }
        }
        return textureTypes;
    };
    /**
     * @returns {String[]}
     */
    TextureResource.prototype.getQualities = function () {
        var quality, qualitities = [];
        for (quality in this._qualitySuffixes) {
            if (this._qualitySuffixes.hasOwnProperty(quality)) {
                qualitities.push(quality);
            }
        }
        return qualitities;
    };
    /**
     * @param {String} type
     * @param {String} quality
     * @returns {ManagedTexture}
     */
    TextureResource.prototype.getManagedTexture = function (type, quality) {
        if (this.isReadyToUse() === false) {
            application.showError("Cannot get managed GL texture for '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        if (this._images[type]) {
            this._managedTextures[type] = this._managedTextures[type] || {};
            this._managedTextures[type][quality] =
                    this._managedTextures[type][quality] ||
                    new managedGL.ManagedTexture(this.getName(), this._images[type][quality], this._useMipmap);
            return this._managedTextures[type][quality];
        }
        application.showError("The requested texture '" + this.getName() + "' has no type '" + type + "' available!");
        return null;
    };
    /**
     * @param {String[]} types
     * @param {String[]} qualityPreferenceList
     * @returns {Object.<String, ManagedTexture>} 
     */
    TextureResource.prototype.getManagedTexturesOfTypes = function (types, qualityPreferenceList) {
        var i, qualities, index, mostFittingQuality, mostFittingQualityIndex, result;
        types.sort();
        // return from cache if possible
        for (i = 0; i < this._cachedManagedTexturesOfTypes.length; i++) {
            if (utils.arraysEqual(types, this._cachedManagedTexturesOfTypes[i].types) && utils.arraysEqual(qualityPreferenceList, this._cachedManagedTexturesOfTypes[i].qualityPreferenceList)) {
                return this._cachedManagedTexturesOfTypes[i].textures;
            }
        }
        result = {};
        qualities = this.getQualities();
        mostFittingQualityIndex = -1;
        for (i = 0; i < qualities.length; i++) {
            index = qualityPreferenceList.indexOf(qualities[i]);
            if ((index >= 0) && ((mostFittingQualityIndex === -1) || (index < mostFittingQualityIndex))) {
                mostFittingQualityIndex = index;
                mostFittingQuality = qualityPreferenceList[index];
            }
        }
        if (mostFittingQualityIndex === -1) {
            application.showError("Texture '" + this.getName() + "' is not available in any of the qualities: [" + qualityPreferenceList.join(", ") + "]!");
            return null;
        }
        for (i = 0; i < types.length; i++) {
            result[types[i]] = this.getManagedTexture(types[i], mostFittingQuality);
        }
        // cache the result
        this._cachedManagedTexturesOfTypes.push({
            types: types,
            qualityPreferenceList: qualityPreferenceList,
            textures: result
        });
        return result;
    };
    /**
     * @param {String[]} qualityPreferenceList
     * @returns {Object.<String, ManagedTexture>} 
     */
    TextureResource.prototype.getManagedTextures = function (qualityPreferenceList) {
        return this.getManagedTexturesOfTypes(this.getTypes(), qualityPreferenceList);
    };
    // ############################################################################################x
    /**
     * @class Represents a cube mapped texture resource.
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function CubemapResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        /**
         * @type String
         */
        this._basepath = dataJSON.basepath;
        /**
         * @type String
         */
        this._format = dataJSON.format;
        /**
         * @type String[]
         */
        this._imageNames = dataJSON.imageNames;
        /**
         * @type Object.<String, String>
         */
        this._qualitySuffixes = dataJSON.qualitySuffixes;
        /**
         * @type Number
         */
        this._loadedImages = 0;
        /**
         * @type Number
         */
        this._imagesToLoad = 0;
        /**
         * @type Object.<String, Image>
         */
        this._images = {};
        /**
         * @type {cubemap: ManagedCubemap, qualityPreferenceList: String[]}[]
         */
        this._cachedManagedCubemaps = [];
    }
    CubemapResource.prototype = new resourceManager.GenericResource();
    CubemapResource.prototype.constructor = CubemapResource;
    /**
     * 
     * @param {String} face
     * @param {String} quality
     * @returns {String}
     */
    CubemapResource.prototype._getPath = function (face, quality) {
        return this._basepath + this._imageNames[face] + this._qualitySuffixes[quality] + "." + this._format;
    };
    /**
     * 
     * @param {String} face
     * @param {string} quality
     * @returns {Function}
     */
    CubemapResource.prototype._getOnLoadImageFunction = function (face, quality) {
        var path = this._getPath(face, quality);
        return function () {
            this._loadedImages++;
            this._onFilesLoad(this._loadedImages === this._imagesToLoad, {path: path});
        }.bind(this);
    };
    /**
     * Displays an error message for the case when the source file for this cubemap with the passed name could not be loaded.
     * @param {String} filename
     */
    CubemapResource.prototype._handleError = function (filename) {
        application.showError("Could not load cube mapped texture '" + this._name + "': downloading file '" + filename + "' failed!");
        this._loadedImages++;
        this._onFilesLoad(this._loadedImages === this._imagesToLoad, {path: filename, error: true});
    };
    /**
     * @override
     * @param {Object} params 
     * @returns {Boolean}
     */
    CubemapResource.prototype.requiresReload = function (params) {
        var face, requestedQualities, quality;
        if (this.isRequested(params)) {
            return false;
        }
        params = params || {};
        requestedQualities = params.qualities || this._qualitySuffixes;
        for (face in this._imageNames) {
            if (this._imageNames.hasOwnProperty(face)) {
                if (!this._images[face]) {
                    return true;
                }
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[face][quality]) {
                            return true;
                        }
                    }
                }
            }
        }
        return false;
    };
    /**
     * @override
     * @param {Object} params 
     */
    CubemapResource.prototype._requestFiles = function (params) {
        var face, requestedQualities, quality;
        params = params || {};
        requestedQualities = params.qualities || this._qualitySuffixes;
        for (face in this._imageNames) {
            if (this._imageNames.hasOwnProperty(face)) {
                this._images[face] = this._images[face] || {};
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[face][quality]) {
                            this._imagesToLoad++;
                            this._images[face][quality] = new Image();
                            this._images[face][quality].onload = this._getOnLoadImageFunction(face, quality).bind(this);
                            this._images[face][quality].onerror = this._handleError.bind(this, this._getPath(face, quality));
                        }
                    }
                }
            }
        }
        // setting the src property of an Image object will automatically result in an asynchronous
        // request to grab the image source file
        for (face in this._imageNames) {
            if (this._imageNames.hasOwnProperty(face)) {
                for (quality in requestedQualities) {
                    if (requestedQualities.hasOwnProperty(quality)) {
                        if (!this._images[face][quality].src) {
                            this._images[face][quality].src = application.getFileURL(CUBEMAP_FOLDER, this._getPath(face, quality));
                        }
                    }
                }
            }
        }
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    CubemapResource.prototype._loadData = function (params) {
        if (!params.error) {
            application.log("Face '" + params.path + "' of cubemap named '" + this.getName() + "' has been loaded.", 2);
            return true;
        }
        application.log("Face '" + params.path + "' of cubemap named '" + this.getName() + "' could not be loaded.", 2);
        return false;
    };
    /**
     * @returns {String[]}
     */
    CubemapResource.prototype.getQualities = function () {
        var quality, qualitities = [];
        for (quality in this._qualitySuffixes) {
            if (this._qualitySuffixes.hasOwnProperty(quality)) {
                qualitities.push(quality);
            }
        }
        return qualitities;
    };
    /**
     * @param {String[]} qualityPreferenceList
     * @returns {ManagedCubemap}
     */
    CubemapResource.prototype.getManagedCubemap = function (qualityPreferenceList) {
        var i, result, qualities, index, mostFittingQuality, mostFittingQualityIndex;
        if (this.isReadyToUse() === false) {
            application.showError("Cannot get managed GL cubemap for '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        // return from cache if possible
        for (i = 0; i < this._cachedManagedCubemaps.length; i++) {
            if (utils.arraysEqual(qualityPreferenceList, this._cachedManagedCubemaps[i].qualityPreferenceList)) {
                return this._cachedManagedCubemaps[i].cubemap;
            }
        }
        qualities = this.getQualities();
        mostFittingQualityIndex = -1;
        for (i = 0; i < qualities.length; i++) {
            index = qualityPreferenceList.indexOf(qualities[i]);
            if ((index >= 0) && ((mostFittingQualityIndex === -1) || (index < mostFittingQualityIndex))) {
                mostFittingQualityIndex = index;
                mostFittingQuality = qualityPreferenceList[index];
            }
        }
        if (mostFittingQualityIndex === -1) {
            application.showError("Cubemap '" + this.getName() + "' is not available in any of the qualities: [" + qualityPreferenceList.join(", ") + "]!");
            return null;
        }
        result = new managedGL.ManagedCubemap(this.getName(), [
            this._images.posX[mostFittingQuality],
            this._images.negX[mostFittingQuality],
            this._images.posY[mostFittingQuality],
            this._images.negY[mostFittingQuality],
            this._images.posZ[mostFittingQuality],
            this._images.negZ[mostFittingQuality]
        ]);
        // cache the result
        this._cachedManagedCubemaps.push({
            qualityPreferenceList: qualityPreferenceList,
            cubemap: result
        });
        return result;
    };
    // ############################################################################################
    /**
     * @typedef {Object} ShaderResource~ManagedShaderBinding
     * @property {ManagedShader} managedShader
     * @property {Object.<String, String>} replacedDefines
     */
    /**
     * @class 
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function ShaderResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        /**
         * The names of the variants of this shaders organized by the variant names.
         * @type Object.<String, String>
         */
        this._variantShaderNames = dataJSON.variants || null;
        /**
         * @type String
         */
        this._vertexShaderSourcePath = dataJSON.vertexShaderSource;
        /**
         * @type String
         */
        this._fragmentShaderSourcePath = dataJSON.fragmentShaderSource;
        /**
         * (enum ShaderBlendMode)
         * @type String
         */
        this._blendMode = types.getEnumValue(managedGL.ShaderBlendMode, dataJSON.blendMode, {name: "shader.blendMode"});
        /**
         * The roles of the vertex attributes (= the name of the data array returned by the model from which they should get their values)
         * organized by the names of the vertex attributes.
         * @type Object.<String, String>
         */
        this._vertexAttributeRoles = dataJSON.vertexAttributeRoles;
        /**
         * The roles of the instance attributes (= the names of the uniforms they replace) organized by the names of the instance attributes.
         * @type Object.<String, String>
         */
        this._instanceAttributeRoles = dataJSON.instanceAttributeRoles || {};
        /**
         * @type String
         */
        this._vertexShaderSource = null;
        /**
         * @type String
         */
        this._fragmentShaderSource = null;
        /**
         * @type ShaderResource~ManagedShaderBinding[]
         */
        this._managedShaderBindings = [];
        /**
         * The total number of shader includes (references shader source files to be inserted into the sources of this shader) of the sources
         * of this shader.
         * @type Number
         */
        this._shaderIncludesToLoad = 0;
        /**
         * The number of already loaded and inserted shader includes of this shader.
         * @type Number
         */
        this._shaderIncludesLoaded = 0;
    }
    ShaderResource.prototype = new resourceManager.GenericResource();
    ShaderResource.prototype.constructor = ShaderResource;
    /**
     * If all source files needed to assemble the final sources of this shader have been loaded and inserted, marks the shader as ready.
     */
    ShaderResource.prototype._checkAllSourcesLoaded = function () {
        if (this._vertexShaderSource && this._fragmentShaderSource && (this._shaderIncludesLoaded === this._shaderIncludesToLoad)) {
            if (this._vertexShaderSource === EMPTY_SHADER_SOURCE) {
                this._vertexShaderSource = null;
            }
            if (this._fragmentShaderSource === EMPTY_SHADER_SOURCE) {
                this._fragmentShaderSource = null;
            }
            this.onFinalLoad();
        }
    };
    /**
     * To be called when a new shader include (references file) has finished downloading - saves the text of the file to the cache and calls
     * the resolution method as well as any other functions queued to execute on the loading of this file. (i.e. this will call the resolution
     * as many times as it has been requested so far for this particular file)
     * @param {String} shaderType (enum ShaderType) The type of the shader in which to insert the source of the downloaded file.
     * @param {String} includeSourceFilename The name of the file (the path by which it was referenced)
     * @param {String} responseText The text of the downloaded file.
     */
    ShaderResource.prototype._loadIncludeSource = function (shaderType, includeSourceFilename, responseText) {
        var i;
        _shaderIncludeCache[includeSourceFilename].source = responseText;
        this._resolveInclude(shaderType, includeSourceFilename);
        for (i = 0; i < _shaderIncludeCache[includeSourceFilename].onLoad.length; i++) {
            _shaderIncludeCache[includeSourceFilename].onLoad[i]();
        }
    };
    /**
     * Extracts the name (path) of the referenced file from the passed source line.
     * @param {String} sourceLine Should be an include statement
     */
    ShaderResource.prototype._getIncludeFileName = function (sourceLine) {
        return sourceLine.substr(SHADER_INCLUDE_STATEMENT_PREFIX.length, sourceLine.length - (SHADER_INCLUDE_STATEMENT_PREFIX.length + SHADER_INCLUDE_STATEMENT_SUFFIX.length));
    };
    /**
     * Inserts the (downloaded and cached) text of an include file into the source of the shader of the passed type. Only replaces the first
     * occurence of the include statement. (that refers to the file with the passed name (path)
     * @param {String} shaderType (enum ShaderType) The type of the shader in which to insert the source of the downloaded file.
     * @param {String} includeFileName
     */
    ShaderResource.prototype._resolveInclude = function (shaderType, includeFileName) {
        var i, includeText = _shaderIncludeCache[includeFileName].source, sourceLines;
        switch (shaderType) {
            case ShaderType.VERTEX:
                sourceLines = this._vertexShaderSource.split("\n");
                break;
            case ShaderType.FRAGMENT:
                sourceLines = this._fragmentShaderSource.split("\n");
                break;
            default:
                application.crash();
        }
        for (i = 0; i < sourceLines.length; i++) {
            if (sourceLines[i].substr(0, SHADER_INCLUDE_STATEMENT_PREFIX.length) === SHADER_INCLUDE_STATEMENT_PREFIX) {
                if (includeFileName === this._getIncludeFileName(sourceLines[i])) {
                    sourceLines[i] = includeText;
                    switch (shaderType) {
                        case ShaderType.VERTEX:
                            this._vertexShaderSource = sourceLines.join("\n");
                            break;
                        case ShaderType.FRAGMENT:
                            this._fragmentShaderSource = sourceLines.join("\n");
                            break;
                        default:
                            application.crash();
                    }
                    this._resolveSource(shaderType, includeText);
                    break;
                }
            }
        }
        this._shaderIncludesLoaded++;
        this._checkAllSourcesLoaded();
    };
    /**
     * Parses the passed shader source text for include statements and either replaces them if the referenced file has already been downloaded
     * and cached or initiates their download and queues the replacement for when the download has finished.
     * @param {String} shaderType (enum ShaderType) The type of the shader in which to insert the source of the downloaded files.
     * @param {String} sourceText The whole or a part of the source of the shader source to scan for include statements.
     */
    ShaderResource.prototype._resolveSource = function (shaderType, sourceText) {
        var i, sourceLines = sourceText.split("\n"), includeSourceFilenames = [];
        for (i = 0; i < sourceLines.length; i++) {
            if (sourceLines[i].substr(0, SHADER_INCLUDE_STATEMENT_PREFIX.length) === SHADER_INCLUDE_STATEMENT_PREFIX) {
                includeSourceFilenames.push(this._getIncludeFileName(sourceLines[i]));
                this._shaderIncludesToLoad++;
            }
        }
        for (i = 0; i < includeSourceFilenames.length; i++) {
            if (_shaderIncludeCache[includeSourceFilenames[i]]) {
                if (_shaderIncludeCache[includeSourceFilenames[i]].source) {
                    this._resolveInclude(shaderType, includeSourceFilenames[i]);
                } else {
                    _shaderIncludeCache[includeSourceFilenames[i]].onLoad.push(this._resolveInclude.bind(this, shaderType, includeSourceFilenames[i]));
                }
            } else {
                _shaderIncludeCache[includeSourceFilenames[i]] = {
                    onLoad: []
                };
                application.requestTextFile(SHADER_FOLDER, includeSourceFilenames[i], this._loadIncludeSource.bind(this, shaderType, includeSourceFilenames[i]));
            }
        }
    };
    /**
     * @override
     * @returns {Boolean}
     */
    ShaderResource.prototype.requiresReload = function () {
        if (this.isRequested()) {
            return false;
        }
        return !this.isLoaded();
    };
    /**
     * @override
     */
    ShaderResource.prototype._requestFiles = function () {
        application.requestTextFile(SHADER_FOLDER, this._vertexShaderSourcePath, function (responseText) {
            this._onFilesLoad(false, {shaderType: ShaderType.VERTEX, text: responseText});
        }.bind(this));
        application.requestTextFile(SHADER_FOLDER, this._fragmentShaderSourcePath, function (responseText) {
            this._onFilesLoad(false, {shaderType: ShaderType.FRAGMENT, text: responseText});
        }.bind(this));
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    ShaderResource.prototype._loadData = function (params) {
        switch (types.getEnumValue(ShaderType, params.shaderType, {
                name: "shaderType", defaultValue: null})) {
            case ShaderType.VERTEX:
                this._vertexShaderSource = params.text || EMPTY_SHADER_SOURCE;
                break;
            case ShaderType.FRAGMENT:
                this._fragmentShaderSource = params.text || EMPTY_SHADER_SOURCE;
                break;
            default:
                application.crash();
        }
        if (params.text) {
            this._resolveSource(params.shaderType, params.text);
        }
        this._checkAllSourcesLoaded();
        if (!params.text) {
            application.log("ERROR: There was an error loading " + params.shaderType + " shader of shader program '" + this._name + "'!", 1);
            return false;
        }
        return true;
    };
    /**
     * Returns the name of the shader that is stored by the passed variant name for this shader.
     * @param {String} variantName
     * @returns {String|null} Null, if there is no such variant for this shader.
     */
    ShaderResource.prototype.getVariantShaderName = function (variantName) {
        return this._variantShaderNames ? this._variantShaderNames[variantName] : null;
    };
    /**
     * @param {Object.<String, String>} [replacedDefines] Values defined in the shader source using #define will be replaced by the values
     * provided in this object (e.g. #define CONST 3 will be changed to #define CONST 5 if {CONST: 5} is passed.
     * @param {Boolean} unpackSamplerArrays If true, arrays of sampler uniforms will be unpacked - that is, substituted 
     * with individual sampler variables for each index in the shader source
     * @returns {ManagedShader}
     */
    ShaderResource.prototype.getManagedShader = function (replacedDefines, unpackSamplerArrays) {
        var i;
        if (this.isReadyToUse() === false) {
            application.showError("Cannot get managed GL shader for '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        replacedDefines = replacedDefines || null;
        for (i = 0; i < this._managedShaderBindings.length; i++) {
            if (utils.objectsEqual(this._managedShaderBindings[i].replacedDefines, replacedDefines)) {
                return this._managedShaderBindings[i].managedShader;
            }
        }
        this._managedShaderBindings.push({
            managedShader: new managedGL.ManagedShader(this.getName(), this._vertexShaderSource, this._fragmentShaderSource, this._blendMode, this._vertexAttributeRoles, this._instanceAttributeRoles, replacedDefines, unpackSamplerArrays),
            replacedDefines: replacedDefines
        });
        return this._managedShaderBindings[this._managedShaderBindings.length - 1].managedShader;
    };
    // ############################################################################################x
    /**
     * @typedef {Object} ModelResource~FileDescriptor
     * @property {String} suffix
     * @property {Number} maxLOD
     */
    /**
     * @class
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function ModelResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        if (dataJSON.model) {
            this._model = dataJSON.model;
            this._files = [];
            this.setToReady();
            return;
        }
        /**
         * @type String
         */
        this._basepath = dataJSON.basepath;
        /**
         * @type String
         */
        this._format = dataJSON.format;
        /**
         * @type ModelResource~FileDescriptor[]
         */
        this._files = dataJSON.files;
        /**
         * @type Number
         */
        this._loadedFiles = 0;
        /**
         * @type Number
         */
        this._filesToLoad = 0;
        /**
         * @type Model
         */
        this._model = null;
        /**
         * @type Number
         */
        this._maxLoadedLOD = -1;
    }
    ModelResource.prototype = new resourceManager.GenericResource();
    ModelResource.prototype.constructor = ModelResource;
    /**
     * @param {Number} maxLOD
     * @returns {String}
     */
    ModelResource.prototype._getPath = function (maxLOD) {
        var i;
        for (i = 0; i < this._files.length; i++) {
            if (this._files[i].maxLOD === maxLOD) {
                return this._basepath + this._files[i].suffix + "." + this._format;
            }
        }
        return null;
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    ModelResource.prototype.requiresReload = function (params) {
        if (this.isRequested(params)) {
            return false;
        }
        if (this._files.length === 0) {
            return false;
        }
        if (params && (typeof params.maxLOD === "number")) {
            return params.maxLOD > this._maxLoadedLOD;
        }
        if (this.getMaxLOD() !== null) {
            return this.requiresReload({maxLOD: this.getMaxLOD()});
        }
        return false;
    };
    /**
     * @returns {Number|null}
     */
    ModelResource.prototype.getMaxLOD = function () {
        var i, result = null;
        for (i = 0; i < this._files.length; i++) {
            if ((result === null) || (this._files[i].maxLOD > result)) {
                result = this._files[i].maxLOD;
            }
        }
        return result;
    };
    /**
     * @param {Number} maxLOD
     */
    ModelResource.prototype._requestFile = function (maxLOD) {
        this._filesToLoad++;
        application.requestTextFile(MODEL_FOLDER, this._getPath(maxLOD), function (responseText) {
            this._loadedFiles++;
            this._onFilesLoad(this._filesToLoad === this._loadedFiles, {maxLOD: maxLOD, text: responseText});
        }.bind(this));
    };
    /**
     * @override
     * @param {Object} params
     */
    ModelResource.prototype._requestFiles = function (params) {
        var lod, maxLOD;
        params = params || {};
        // if a maxmimum LOD was requested
        if (params.maxLOD !== undefined) {
            // first look for the highest LOD file at or below the requested level
            for (lod = params.maxLOD; lod >= 0; lod--) {
                if (this._getPath(lod) !== null) {
                    this._requestFile(lod);
                    return;
                }
            }
            // if no files are available at all at or below the requested LOD level, check for higher quality ones
            if ((lod < 0) && (this._files.length > 0)) {
                maxLOD = this.getMaxLOD();
                for (lod = params.maxLOD + 1; lod <= maxLOD; lod++) {
                    if (this._getPath(lod) !== null) {
                        this._requestFile(lod);
                        return;
                    }
                }
            }
            application.showError("Could not find any files to load for model: '" + this._name + "'!");
        } else {
            // if no LOD was specified, request files to cover all available LODs
            this._requestFiles({maxLOD: this.getMaxLOD()});
        }
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    ModelResource.prototype._loadData = function (params) {
        this._model = new egomModel.Model();
        if (!params.text) {
            application.showError("Model file of max LOD level " + params.maxLOD + " could not be loaded for model '" + this.getName() + "'!");
            return false;
        }
        application.log("Model file of max LOD level " + params.maxLOD + " has been loaded for model '" + this.getName() + "'", 2);
        if (params.text[0] === "{") {
            this._model.loadFromJSON(this._getPath(params.maxLOD), JSON.parse(params.text), params.maxLOD);
        } else if (params.text[0] === "<") {
            this._model.loadFromXML(this._getPath(params.maxLOD), new window.DOMParser().parseFromString(params.text, "text/xml"), params.maxLOD);
        } else {
            application.showError("Cannot load Egom Mode from file '" + this._getPath(params.maxLOD) + "', as it does no appear to be either an XML or a JSON file!");
        }
        this._maxLoadedLOD = params.maxLOD;
        return true;
    };
    /**
     * @returns {Model}
     */
    ModelResource.prototype.getEgomModel = function () {
        if (this.isReadyToUse() === false) {
            application.showError("Cannot get model object for '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        return this._model;
    };
    // ############################################################################################
    /**
     * @class
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function SoundEffectResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        /**
         * The filenames (paths withing the sound effect folder) of the samples that correspond to this sound effect - when playing back
         * the effect, one of these samples is chosen randomly
         * @type String[]
         */
        this._samples = dataJSON.samples;
        /**
         * @type Number
         */
        this._loadedSamples = 0;
        /**
         * @type Number
         */
        this._samplesToLoad = 0;
    }
    SoundEffectResource.prototype = new resourceManager.GenericResource();
    SoundEffectResource.prototype.constructor = SoundEffectResource;
    /**
     * @override
     * @returns {Boolean}
     */
    SoundEffectResource.prototype.requiresReload = function () {
        return !this.isReadyToUse() && !this.isRequested();
    };
    /**
     * @param {Number} index
     */
    SoundEffectResource.prototype._requestFile = function (index) {
        this._samplesToLoad++;
        application.requestFile(SOUND_EFFECT_FOLDER, this._samples[index], function (request) {
            if (request) {
                audio.loadSample(this._samples[index], request, function () {
                    this._loadedSamples++;
                    this._onFilesLoad(this._samplesToLoad === this._loadedSamples, {path: this._samples[index]});
                }.bind(this));
            } else {
                application.showError("Could not load sound sample '" + this.getName() + "'!");
                this._samples[index] = null;
                this._loadedSamples++;
                this._onFilesLoad(this._samplesToLoad === this._loadedSamples, {path: this._samples[index], error: true});
            }
        }.bind(this), undefined, "arraybuffer");
    };
    /**
     * @override
     */
    SoundEffectResource.prototype._requestFiles = function () {
        var i;
        for (i = 0; i < this._samples.length; i++) {
            this._requestFile(i);
        }
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    SoundEffectResource.prototype._loadData = function (params) {
        if (!params.error) {
            application.log("Sound effect sample from file: " + params.path + " has been loaded.", 2);
            return true;
        }
        application.log("Sound effect sample from file: " + params.path + " could not be loaded.", 2);
        return false;
    };
    /**
     * Plays back one of the samples (randomly chosen) corresponding to this effect, without saving a reference to it. The samples must be
     * loaded.
     * @param {Number} [volume=1]
     * @param {Number[3]} [position]
     * @param {Number} [rolloff=1]
     */
    SoundEffectResource.prototype.play = function (volume, position, rolloff) {
        var sample;
        if (this.isReadyToUse() === false) {
            application.showError("Cannot play sound effect '" + this.getName() + "', as it has not been loaded from file yet!");
            return;
        }
        sample = this._samples[Math.floor(Math.random() * this._samples.length)];
        if (sample) {
            audio.playSound(sample, volume, position, rolloff);
        } else {
            application.log("WARNING: cannot play sound sample '" + sample + "', as there was a problem while loading it.", 1);
        }
    };
    /**
     * Creates a sound source for a randomly chosen sample corresponding to this effect and returns the reference to it. The samples must be
     * loaded.
     * @param {Number} [volume=1]
     * @param {Boolean} [loop=false]
     * @param {Number[3]} [position]
     * @param {Number} [rolloff=1]
     * @returns {SoundSource}
     */
    SoundEffectResource.prototype.createSoundSource = function (volume, loop, position, rolloff) {
        var sample;
        if (this.isReadyToUse() === false) {
            application.showError("Cannot create sound source for sound effect '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        sample = this._samples[Math.floor(Math.random() * this._samples.length)];
        if (sample) {
            return new audio.SoundSource(audio.SoundCategory.SOUND_EFFECT, sample, volume, loop, position, rolloff);
        }
        application.log("WARNING: cannot create sound source for sample '" + sample + "', as there was a problem while loading it.", 1);
        return null;
    };
    // ############################################################################################
    /**
     * @class
     * @augments GenericResource
     * @param {Object} dataJSON
     */
    function MusicResource(dataJSON) {
        resourceManager.GenericResource.call(this, dataJSON.name);
        /**
         * The filename (path withing the music folder) of the sample that correspond to this song
         * @type String
         */
        this._sample = dataJSON.sample;
    }
    MusicResource.prototype = new resourceManager.GenericResource();
    MusicResource.prototype.constructor = MusicResource;
    /**
     * @override
     * @returns {Boolean}
     */
    MusicResource.prototype.requiresReload = function () {
        return !this.isReadyToUse() && !this.isRequested();
    };
    /**
     * @override
     */
    MusicResource.prototype._requestFiles = function () {
        application.requestFile(MUSIC_FOLDER, this._sample, function (request) {
            if (request) {
                audio.loadSample(this._sample, request, function () {
                    this._onFilesLoad(true, {path: this._sample});
                }.bind(this));
            } else {
                application.showError("Could not load music track '" + this.getName() + "'!");
                this._sample = null;
                this._onFilesLoad(true, {path: this._sample, error: true});
            }
        }.bind(this), undefined, "arraybuffer");
    };
    /**
     * @override
     * @param {Object} params
     * @returns {Boolean}
     */
    MusicResource.prototype._loadData = function (params) {
        if (!params.error) {
            application.log("Music song from file: " + params.path + " has been loaded.", 2);
            return true;
        }
        application.log("Music song from file: " + params.path + " cound not be loaded.", 2);
        return false;
    };
    /**
     * Creates a sound source for the sample corresponding to this music and returns the reference to it. The sample must be loaded.
     * @param {Number} [volume=1]
     * @param {Boolean} [loop=false]
     * @returns {SoundSource}
     */
    MusicResource.prototype.createSoundSource = function (volume, loop) {
        if (this.isReadyToUse() === false) {
            application.showError("Cannot create sound source for music '" + this.getName() + "', as it has not been loaded from file yet!");
            return null;
        }
        if (this._sample) {
            return new audio.SoundSource(audio.SoundCategory.MUSIC, this._sample, volume, loop);
        }
        application.log("WARNING: cannot create sound source for music track '" + this._sample + "', as there was a problem while loading it.", 1);
        return null;
    };
    // ############################################################################################
    /**
     * @class
     * @augments ResourceManager
     */
    function MediaResourceManager() {
        resourceManager.ResourceManager.call(this);
    }
    MediaResourceManager.prototype = new resourceManager.ResourceManager();
    MediaResourceManager.prototype.constructor = MediaResourceManager;
    /**
     * @param {String} name
     * @returns {TextureResource}
     */
    MediaResourceManager.prototype.getTexture = function (name) {
        return this.getResource(TEXTURE_ARRAY_NAME, name);
    };
    /**
     * @param {String} name
     * @returns {CubemapResource}
     */
    MediaResourceManager.prototype.getCubemap = function (name) {
        return this.getResource(CUBEMAP_ARRAY_NAME, name);
    };
    /**
     * @param {String} name
     * @returns {ShaderResource}
     */
    MediaResourceManager.prototype.getShader = function (name) {
        return this.getResource(SHADER_ARRAY_NAME, name);
    };
    /**
     * Returns the shader resource representing the given variant of the shader with the given name, if it exists, or the one representing
     * the original shader resource with the given name, if it does not.
     * @param {String} name
     * @param {String} variantName
     * @returns {ShaderResource}
     */
    MediaResourceManager.prototype.getVariantShader = function (name, variantName) {
        return this.getResource(SHADER_ARRAY_NAME, this.getResource(SHADER_ARRAY_NAME, name, {doNotLoad: true}).getVariantShaderName(variantName), {allowNullResult: true}) || this.getShader(name);
    };
    /**
     * @param {String} name
     * @param {Object} params
     * @returns {ModelResource}
     */
    MediaResourceManager.prototype.getModel = function (name, params) {
        return this.getResource(MODEL_ARRAY_NAME, name, params);
    };
    /**
     * @param {Model} model
     * @returns {ModelResource}
     */
    MediaResourceManager.prototype.getOrAddModel = function (model) {
        var result = this.getResource(MODEL_ARRAY_NAME, model.getName(), {allowNullResult: true});
        if (!result) {
            result = this.addResource(MODEL_ARRAY_NAME, new ModelResource({
                "name": model.getName(),
                "model": model
            }));
        }
        return result;
    };
    /**
     * @param {String} name
     * @returns {SoundEffectResource}
     */
    MediaResourceManager.prototype.getSoundEffect = function (name) {
        return this.getResource(SOUND_EFFECT_ARRAY_NAME, name);
    };
    /**
     * @param {String} name
     * @returns {MusicResource}
     */
    MediaResourceManager.prototype.getMusic = function (name) {
        return this.getResource(MUSIC_ARRAY_NAME, name);
    };
    // ------------------------------------------------------------------------------
    // Public functions
    /**
     * Sends an asynchronous request to grab the file containing the media
     * resource descriptions and sets a callback to load those descriptions as 
     * well as run a custom callback if given, as well, after the loading has 
     * been completed.
     * @param {{folder: String, filename: String}} mediaResourceFileDescriptor
     * @param {Function} callback
     */
    function requestConfigLoad(mediaResourceFileDescriptor, callback) {
        var resourceClassAssignment = {};
        resourceClassAssignment[TEXTURE_ARRAY_NAME] = TextureResource;
        resourceClassAssignment[CUBEMAP_ARRAY_NAME] = CubemapResource;
        resourceClassAssignment[SHADER_ARRAY_NAME] = ShaderResource;
        resourceClassAssignment[MODEL_ARRAY_NAME] = ModelResource;
        resourceClassAssignment[SOUND_EFFECT_ARRAY_NAME] = SoundEffectResource;
        resourceClassAssignment[MUSIC_ARRAY_NAME] = MusicResource;
        _resourceManager.requestConfigLoad(mediaResourceFileDescriptor.filename, mediaResourceFileDescriptor.folder, resourceClassAssignment, callback);
    }
    _resourceManager = new MediaResourceManager();
    return {
        requestConfigLoad: requestConfigLoad,
        requestResourceLoad: _resourceManager.requestResourceLoad.bind(_resourceManager),
        getTexture: _resourceManager.getTexture.bind(_resourceManager),
        getCubemap: _resourceManager.getCubemap.bind(_resourceManager),
        getShader: _resourceManager.getShader.bind(_resourceManager),
        getVariantShader: _resourceManager.getVariantShader.bind(_resourceManager),
        getModel: _resourceManager.getModel.bind(_resourceManager),
        getOrAddModel: _resourceManager.getOrAddModel.bind(_resourceManager),
        getSoundEffect: _resourceManager.getSoundEffect.bind(_resourceManager),
        getMusic: _resourceManager.getMusic.bind(_resourceManager),
        executeWhenReady: _resourceManager.executeWhenReady.bind(_resourceManager),
        executeOnResourceLoad: _resourceManager.executeOnResourceLoad.bind(_resourceManager)
    };
});
