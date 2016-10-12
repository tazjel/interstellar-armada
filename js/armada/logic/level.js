/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file Implementation of loading and managing environments and levels - including the main game simulation loop
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 2.0
 */

/*jslint nomen: true, white: true, plusplus: true */
/*global define, Element, this, Float32Array, performance */

/**
 * @param utils Used for format strings and useful constants
 * @param vec Vector operations are needed for several logic functions
 * @param mat Matrices are widely used for 3D simulation
 * @param application Used for file loading and logging functionality
 * @param asyncResource LogicContext is a subclass of AsyncResource
 * @param resources Used to access the loaded media (graphics and sound) resources
 * @param pools Used to access the pools for particles and projectiles
 * @param camera Used for creating camera configurations for views
 * @param renderableObjects Used for creating visual models for game objects
 * @param lights Used for creating light sources for game objects and levels
 * @param sceneGraph Creating and managing the scene graph for visual simulation is done using this module
 * @param graphics Used to access graphics settings
 * @param classes Used to load and access the classes of Interstellar Armada
 * @param config Used to access game settings/configuration
 * @param strings Used for translation support
 * @param spacecraft Used for creating spacecrafts
 * @param equipment Used for accessing the common projectile pool
 * @param ai Used for setting the artificial intelligence pilots when creating a level.
 */
define([
    "utils/utils",
    "utils/vectors",
    "utils/matrices",
    "modules/application",
    "modules/async-resource",
    "modules/media-resources",
    "modules/pools",
    "modules/scene/camera",
    "modules/scene/renderable-objects",
    "modules/scene/lights",
    "modules/scene/scene-graph",
    "armada/graphics",
    "armada/classes",
    "armada/configuration",
    "armada/strings",
    "armada/logic/spacecraft",
    "armada/logic/equipment",
    "armada/logic/ai",
    "utils/polyfill"
], function (
        utils, vec, mat,
        application, asyncResource, resources, pools,
        camera, renderableObjects, lights, sceneGraph,
        graphics, classes, config, strings, spacecraft, equipment, ai) {
    "use strict";
    var
            // ------------------------------------------------------------------------------
            // constants
            /**
             * When adding random ships or ships without a team to a level in demo mode, they will be automatically put into a team with
             * this name, with an ID that equals the index of the spacecraft added + 1 (converted to string).
             * @type String
             */
            GENERIC_TEAM_NAME = "team",
            /**
             * When executing callbacks for all environments, this string is passed as the category parameter.
             * @type String
             */
            ENVIRONMENTS_CATEGORY_NAME = "environments",
            // ------------------------------------------------------------------------------
            // private variables
            /**
             * Cached value of the configuration setting for toggling hitbox visibility based on for which objects are hitchecks calculated.
             * @type Boolean
             */
            _showHitboxesForHitchecks,
            /**
             * A pool containing dynamic particles (such as particles for muzzle flashes and explosions) for reuse, so that creation of
             * new particle objects can be decreased for optimization.
             * @type Pool
             */
            _particlePool,
            /**
             * A pool containing projectiles for reuse, so that creation of new projectile objects can be decreased for optimization.
             * @type Pool
             */
            _projectilePool,
            /**
             * The context storing the current settings and game data that can be accessed through the interface of this module
             * @type LogicContext
             */
            _context,
            /**
             * This string is available to other modules through a public function so that an arbitrary piece of information from this 
             * module can be exposed for debug purposes.
             * @type String
             */
            _debugInfo = "";
    // -------------------------------------------------------------------------
    // Public functions
    /**
     * Queries a module-level string for debug purposes.
     * @returns {String}
     */
    function getDebugInfo() {
        return _debugInfo;
    }
    // ##############################################################################
    /**
     * @class Represents a skybox that can be added to a scene to render the
     * background using a cube mapped texture defined by the passed class of the
     * skybox.
     * @param {SkyboxClass} skyboxClass
     */
    function Skybox(skyboxClass) {
        /**
         * The class storing the general characteristics of this skybox.
         * @type SkyboxClass
         */
        this._class = skyboxClass;
    }
    /**
     * Adds a background FVQ object to the passed scene and sets it up according
     * the properties of this skybox.
     * @param {Scene} scene
     */
    Skybox.prototype.addToScene = function (scene) {
        this._class.acquireResources();
        resources.executeWhenReady(function () {
            scene.addBackgroundObject(new renderableObjects.CubemapSampledFVQ(
                    this._class.getModel(),
                    this._class.getShader(),
                    this._class.getShader().getCubemapNames()[0],
                    this._class.getCubemap(graphics.getCubemapQualityPreferenceList()),
                    scene.getCamera()));
        }.bind(this));
    };
    /**
     * Removes all references to other objects for proper cleanup of memory.
     */
    Skybox.prototype.destroy = function () {
        this._class = null;
    };
    // ##############################################################################
    /**
     * Represents an "infinitely far away" object in space (typically a star)
     * that serves as a light source as well as is rendered as a set of 2D texture
     * layers on the background.
     * @param {BackgroundObjectClass} backgroundObjectClass
     * @param {Number} size The factor to scale the background object with
     * @param {Number} degreesAlpha The angle between the positive X axis and the
     * direction in which this object is positioned on the XZ plane in degrees.
     * @param {Number} degreesBeta The angle between the XZ plane and the
     * direction in which this object is positioned.
     * @param {Number} degreesGamma  The angle by which the object is rotated around its
     * center in 2D (in case it has a fixed orientation), in degrees.
     */
    function BackgroundObject(backgroundObjectClass, size, degreesAlpha, degreesBeta, degreesGamma) {
        /**
         * The class storing the general characteristics of this object.
         * @type BackgroundObjectClass
         */
        this._class = backgroundObjectClass;
        /**
         * The background object will be scaled by this factor
         * @type Number
         */
        this._size = size;
        /**
         * A unit length vector pointing in the direction of this object.
         * @type Number[3]
         */
        this._direction = [
            Math.cos(Math.radians(degreesAlpha)) * Math.cos(Math.radians(degreesBeta)),
            Math.sin(Math.radians(degreesAlpha)) * Math.cos(Math.radians(degreesBeta)),
            Math.sin(Math.radians(degreesBeta))
        ];
        /**
         * The angle by which the object is rotated around its center in 2D (in case it has a 
         * fixed orientation), in degrees.
         * @type Number
         */
        this._angle = Math.radians(degreesGamma) || 0;
    }
    /**
     * Adds the layered texture object and the light source belonging to this
     * object to the passed scene.
     * @param {Scene} scene
     */
    BackgroundObject.prototype.addToScene = function (scene) {
        scene.addDirectionalLightSource(new lights.DirectionalLightSource(this._class.getLightColor(), this._direction));
        this._class.acquireResources();
        resources.executeWhenReady(function () {
            var i, layers, layerParticle;
            layers = this._class.getLayers();
            for (i = 0; i < layers.length; i++) {
                layerParticle = new renderableObjects.BackgroundBillboard(
                        layers[i].getModel(),
                        layers[i].getShader(),
                        layers[i].getTexturesOfTypes(layers[i].getShader().getTextureTypes(), graphics.getTextureQualityPreferenceList()),
                        layers[i].getColor(),
                        layers[i].getSize() * this._size,
                        mat.translation4v(vec.scaled3(this._direction, config.getSetting(config.BATTLE_SETTINGS.BACKGROUND_OBJECT_DISTANCE))),
                        this._angle);
                layerParticle.setRelativeSize(1.0);
                scene.addBackgroundObject(layerParticle);
            }
        }.bind(this));
    };
    /**
     * Removes all references to other objects for proper cleanup of memory.
     */
    BackgroundObject.prototype.destroy = function () {
        this._class = null;
        this._direction = null;
    };
    // ##############################################################################
    /**
     * Creates a dust particle object and adds it to the scene it's cloud it part
     * of right away.
     * @class A tiny piece of dust that is rendered as passing line to indicate the
     * direction and speed of movement to the player.
     * @param {DustCloud} cloud The cloud to which this dust particle belongs.
     * @param {Number[3]} positionVector
     */
    function DustParticle(cloud, positionVector) {
        /**
         * @type Number[3]
         */
        this._positionVector = positionVector;
        /**
         * The renderable object representing this particle in the scene.
         * @type PointParticle
         */
        this._visualModel = null;
        /**
         * @type DustCloud
         */
        this._cloud = cloud;
        /**
         * The distance up to how far away this particle can be from the camera.
         * @type Number
         */
        this._range = cloud.getRange();
    }
    /**
     * Adds the visual model of this particle to a scene, using the passed node
     * as its rendering parent.
     * @param {PointCloud} cloudNode
     * @param {Boolean} addOwnProperties
     */
    DustParticle.prototype.addToScene = function (cloudNode, addOwnProperties) {
        this._visualModel = new renderableObjects.PointParticle(
                this._cloud.getClass().getModel(),
                this._cloud.getClass().getShader(),
                this._cloud.getClass().getInstancedShader(),
                this._positionVector,
                addOwnProperties ? this._cloud.getClass().getColor() : null,
                addOwnProperties ? this._range : null);
        cloudNode.addSubnode(new sceneGraph.RenderableNode(this._visualModel, false, config.getSetting(config.BATTLE_SETTINGS.MINIMUM_DUST_PARTICLE_COUNT_FOR_INSTANCING)));
    };
    /**
     * @returns {PointParticle}
     */
    DustParticle.prototype.getVisualModel = function () {
        return this._visualModel;
    };
    /**
     * Updates the position of the particle to be acound the camera within proper
     * range.
     * @param {Camera} camera The camera relative to which to position the
     * particles.
     */
    DustParticle.prototype.simulate = function (camera) {
        this._visualModel.fitPositionWithinRange(camera.getCameraPositionMatrix(), this._range);
    };
    /**
     * Removes all references to other objects for proper cleanup of memory.
     */
    DustParticle.prototype.destroy = function () {
        this._positionVector = null;
        if (this._visualModel) {
            this._visualModel.getNode().markAsReusable();
            this._visualModel = null;
        }
        this._cloud = null;
    };
    // ##############################################################################
    /**
     * @class Represents a dust cloud containing dust particles that can indicate
     * direction and speed of movement of the camera for the player.
     * @param {DustCloudClass} dustCloudClass The class of this cloud, storing
     * it's general properties.
     * @returns {DustCloud}
     */
    function DustCloud(dustCloudClass) {
        /**
         * The class storing the general characteristics of this cloud.
         * @type DustCloudClass
         */
        this._class = dustCloudClass;
        /**
         * The array of particles this cloud consists of.
         * @type DustParticle[]
         */
        this._particles = null;
        /**
         * The renderable object representing this cloud in the scene.
         * @type PointCloud
         */
        this._visualModel = null;
    }
    /**
     * @returns {DustCloudClass}
     */
    DustCloud.prototype.getClass = function () {
        return this._class;
    };
    /**
     * Return the color of particles of this cloud. 
     * @returns {Number[4]}
     */
    DustCloud.prototype.getColor = function () {
        return this._class.getColor().concat(1.0);
    };
    /**
     * Returns the range this cloud spans. (the maximum distance of particles
     * from the camera in world space coordinates on any angle)
     * @returns {Number}
     */
    DustCloud.prototype.getRange = function () {
        return this._class.getRange();
    };
    /**
     * Adds the needed objects to the scene to render this dust cloud.
     * @param {sceneGraph} scene
     */
    DustCloud.prototype.addToScene = function (scene) {
        var i, n, particle;
        this._class.acquireResources();
        this._particles = [];
        n = this._class.getNumberOfParticles();
        for (i = 0; i < n; i++) {
            particle = new DustParticle(
                    this,
                    [
                        (Math.random() - 0.5) * 2 * this._class.getRange(),
                        (Math.random() - 0.5) * 2 * this._class.getRange(),
                        (Math.random() - 0.5) * 2 * this._class.getRange()]);
            this._particles.push(particle);
        }
        resources.executeWhenReady(function () {
            var j, node;
            this._visualModel = new renderableObjects.RenderableObject(null, false, false, undefined, false);
            node = scene.addNode(new sceneGraph.RenderableNode(this._visualModel, true));
            for (j = 0; j < n; j++) {
                this._particles[j].addToScene(node, j === 0);
            }
        }.bind(this));
    };
    /**
     * Updates the position of the particles in the cloud.
     * @param {Camera} camera The camera around which the cloud should be rendered.
     */
    DustCloud.prototype.simulate = function (camera) {
        var i, n;
        n = this._class.getNumberOfParticles();
        this._particles[0].getVisualModel().setShift(camera.getVelocityVector()[0], camera.getVelocityVector()[1], camera.getVelocityVector()[2]);
        for (i = 0; i < n; i++) {
            this._particles[i].simulate(camera);
        }
    };
    /**
     * Removes all references to other objects for proper cleanup of memory.
     */
    DustCloud.prototype.destroy = function () {
        var i, n;
        n = this._class.getNumberOfParticles();
        this._class = null;
        if (this._particles) {
            for (i = 0; i < n; i++) {
                this._particles[i].destroy();
                this._particles[i] = null;
            }
            this._particles = null;
        }
        if (this._visualModel) {
            this._visualModel.getNode().markAsReusable();
            this._visualModel = null;
        }
    };
    // #########################################################################
    /**
     * @class Represents an environment that can be used to build a visual 
     * representation and perform the game logic on a virtual environment where 
     * the game takes place.
     * @param {Object} dataJSON If given, the data of the environment will be
     * initialized from this JSON object.
     * @returns {Environment}
     */
    function Environment(dataJSON) {
        /**
         * Identifies the environment
         * @type String
         */
        this._name = null;
        /**
         * The list of skyboxes this environment contains as background.
         * @type Skybox[]
         */
        this._skyboxes = null;
        /**
         * The list of background objects (stars, nebulae) this environment contains.
         * @type BackgroundObject[]
         */
        this._backgroundObjects = null;
        /**
         * The list of dust clouds this environment contains.
         * @type DustCloud[]
         */
        this._dustClouds = null;
        /**
         * The camera relative to which the environment is rendered.
         * @type Camera
         */
        this._camera = null;
        /**
         * Stores the object this environment was initialized from.
         * @type Object
         */
        this._dataJSON = null;
        // if given, load the data from the JSON object
        if (dataJSON !== undefined) {
            this.loadFromJSON(dataJSON);
        }
    }
    // methods
    /**
     * Loads all the data about this environment stored in the passed JSON object.
     * @param {Object} dataJSON
     */
    Environment.prototype.loadFromJSON = function (dataJSON) {
        var i, backgroundObjectClass;
        this._dataJSON = dataJSON;
        this._name = dataJSON.name;
        this._skyboxes = [];
        for (i = 0; i < dataJSON.skyboxes.length; i++) {
            this._skyboxes.push(new Skybox(classes.getSkyboxClass(dataJSON.skyboxes[i].class)));
        }

        this._backgroundObjects = [];
        for (i = 0; i < dataJSON.backgroundObjects.length; i++) {
            backgroundObjectClass = classes.getBackgroundObjectClass(dataJSON.backgroundObjects[i].class);
            if (!dataJSON.backgroundObjects[i].position) {
                application.showError("No position specified for background object of class '" + backgroundObjectClass.getName() + "' in environment '" + this._name + "'!", application.ErrorSeverity.MINOR);
            }
            this._backgroundObjects.push(new BackgroundObject(
                    backgroundObjectClass,
                    dataJSON.backgroundObjects[i].size || application.showError("No size specified for background object of class '" + backgroundObjectClass.getName() + "' in environment '" + this._name + "'!", application.ErrorSeverity.MINOR) || 0,
                    (dataJSON.backgroundObjects[i].position && dataJSON.backgroundObjects[i].position.angleAlpha) || 0,
                    (dataJSON.backgroundObjects[i].position && dataJSON.backgroundObjects[i].position.angleBeta) || 0,
                    (dataJSON.backgroundObjects[i].position && dataJSON.backgroundObjects[i].position.angleGamma) || 0
                    ));
        }

        this._dustClouds = [];
        for (i = 0; i < dataJSON.dustClouds.length; i++) {
            this._dustClouds.push(new DustCloud(classes.getDustCloudClass(dataJSON.dustClouds[i].class)));
        }
    };
    /**
     * Returns the object this environment was initialized from
     * @returns {Object}
     */
    Environment.prototype.getData = function () {
        return this._dataJSON;
    };
    /**
     * Reinitializes the properties of the environment from the initialization object (use in case the object
     * has been changed - e.g. edited in a development tool - do not use within the game itself!)
     */
    Environment.prototype.reloadData = function () {
        this.loadFromJSON(this._dataJSON);
    };
    /**
     * Adds renderable objects representing all visual elements of the 
     * environment to the passed scene.
     * @param {Scene} scene
     */
    Environment.prototype.addToScene = function (scene) {
        var i;
        for (i = 0; i < this._skyboxes.length; i++) {
            this._skyboxes[i].addToScene(scene);
        }
        for (i = 0; i < this._backgroundObjects.length; i++) {
            this._backgroundObjects[i].addToScene(scene);
        }
        for (i = 0; i < this._dustClouds.length; i++) {
            this._dustClouds[i].addToScene(scene);
        }
        this._camera = scene.getCamera();
    };
    /**
     * Performs a simulation step to update the state of the environment.
     */
    Environment.prototype.simulate = function () {
        var i;
        for (i = 0; i < this._dustClouds.length; i++) {
            this._dustClouds[i].simulate(this._camera);
        }
    };
    Environment.prototype.destroy = function () {
        var i;
        if (this._skyboxes) {
            for (i = 0; i < this._skyboxes.length; i++) {
                this._skyboxes[i].destroy();
                this._skyboxes[i] = null;
            }
            this._skyboxes = null;
        }
        if (this._backgroundObjects) {
            for (i = 0; i < this._backgroundObjects.length; i++) {
                this._backgroundObjects[i].destroy();
                this._backgroundObjects[i] = null;
            }
            this._backgroundObjects = null;
        }
        if (this._dustClouds) {
            for (i = 0; i < this._dustClouds.length; i++) {
                this._dustClouds[i].destroy();
                this._dustClouds[i] = null;
            }
            this._dustClouds = null;
        }
        this._camera = null;
    };
    // #########################################################################
    /**
     * @class A class responsible for loading and storing game logic related 
     * settings and data as well and provide an interface to access them.
     * @extends AsyncResource
     */
    function LogicContext() {
        asyncResource.AsyncResource.call(this);
        /**
         * An associative array storing the reusable Environment objects that 
         * describe possible environments for levels. The keys are the names
         * of the environments.
         * @type Object.<String, Environment>
         */
        this._environments = null;
    }
    LogicContext.prototype = new asyncResource.AsyncResource();
    LogicContext.prototype.constructor = LogicContext;
    /**
     * Return the reusable environment with the given name if it exists, otherwise null.
     * @param {String} name
     * @returns {Environment}
     */
    LogicContext.prototype.getEnvironment = function (name) {
        return this._environments[name] || null;
    };
    /**
     * Returns the list of names (IDs) of the loaded environments.
     * @returns {String[]}
     */
    LogicContext.prototype.getEnvironmentNames = function () {
        return Object.keys(this._environments);
    };
    /**
     * Creates a new environment and adds it to the list. Uses the passed JSON for the initialization of the environment
     * @param {Object} dataJSON
     */
    LogicContext.prototype.createEnvironment = function (dataJSON) {
        this._environments[dataJSON.name] = new Environment(dataJSON);
    };
    /**
     * Executes the passed callback function for all the stored environments, passing each environment and a constant category string as the
     * two parameters
     * @param {Function} callback
     */
    LogicContext.prototype.executeForAllEnvironments = function (callback) {
        var i, environmentNames = this.getEnvironmentNames();
        for (i = 0; i < environmentNames.length; i++) {
            callback(this._environments[environmentNames[i]], ENVIRONMENTS_CATEGORY_NAME);
        }
    };
    // methods
    /**
     * Sends an asynchronous request to grab the file containing the reusable
     * environment descriptions and sets a callback to load those descriptions 
     * and set the resource state of this context to ready when done.
     */
    LogicContext.prototype.requestEnvironmentsLoad = function () {
        application.requestTextFile(
                config.getConfigurationSetting(config.CONFIGURATION.ENVIRONMENTS_SOURCE_FILE).folder,
                config.getConfigurationSetting(config.CONFIGURATION.ENVIRONMENTS_SOURCE_FILE).filename,
                function (responseText) {
                    this.loadEnvironmentsFromJSON(JSON.parse(responseText));
                    this.setToReady();
                }.bind(this));
    };
    /**
     * Loads the desciptions of all reusable environments from the passed JSON object,
     *  creates and stores all the objects for them.
     * @param {Object} dataJSON
     */
    LogicContext.prototype.loadEnvironmentsFromJSON = function (dataJSON) {
        var i, environment;
        this._environments = {};
        for (i = 0; i < dataJSON.environments.length; i++) {
            environment = new Environment(dataJSON.environments[i]);
            this._environments[dataJSON.environments[i].name] = environment;
        }
    };
    // #########################################################################
    /**
     * @class
     * A team to which spacecrafts can belong to that determines which spacecrafts are hostile and friendly towards each other.
     * @param {String|Object} idOrParams
     */
    function Team(idOrParams) {
        /**
         * The unique string ID of this team.
         * @type String
         */
        this._id = null;
        /**
         * A string name of this team to be used for chosing the translated displayed name.
         * @type String
         */
        this._name = null;
        /**
         * The color to use when replacing original faction colors of spacecrafts belonging to this team.
         * @tpye Number[4]
         */
        this._color = null;
        if (typeof idOrParams === "string") {
            this._id = idOrParams;
            this._name = idOrParams;
        } else if (typeof idOrParams === "object") {
            this._id = idOrParams.id || idOrParams.name || application.showError("Team defined without a name or id!");
            this._name = idOrParams.name || idOrParams.id;
            this._color = idOrParams.color || null;
        } else {
            application.showError("Invalid parameter specified for Team constructor!");
        }
    }
    /**
     * Returns the unique string ID of this team.
     * @returns {String}
     */
    Team.prototype.getID = function () {
        return this._id;
    };
    /**
     * Returns the translated, human-readable unique name of this team.
     * @returns {String}
     */
    Team.prototype.getDisplayName = function () {
        return utils.formatString(strings.get(strings.TEAM.PREFIX, this._name), {
            id: this._id
        });
    };
    /**
     * Returns the color to use when replacing original faction colors of spacecrafts belonging to this team.
     * @returns {Number[4]}
     */
    Team.prototype.getColor = function () {
        return this._color;
    };
    // #########################################################################
    /**
     * @class
     * An octree node that is used to partition spacecrafts. Recursively divides the given list of spacecrafts among its subnodes and can
     * retrieve a subset of this list belonging to an area in space by choosing the appropriate subnodes.
     * @param {Spacecraft[]} objects The list of spacecrafts belonging to this node. (to be divided among its subnodes)
     * @param {Number} maximumDepth The maximum number of levels below this node that should be created when dividing the objects.
     * @param {Number} maximumObjectCount If the node has this much or fewer objects, it will not divide them further (become a leaf node)
     * @param {Boolean} [isRootNode=false] If true, the node will calculate boundaries based on the contained spacecrafts and whenever
     * asked for spacecrafts in a region outside these boundaries, it will return an emptry list instead of recursively checking its
     * subnodes.
     */
    function Octree(objects, maximumDepth, maximumObjectCount, isRootNode) {
        /**
         * The list of spacecrafts belonging to this node.
         * @type Spacecraft[]
         */
        this._objects = objects;
        /**
         * The world coordinates of the point in space which divides the region beloning to this node to 8 subregions (2x2x2), which belong
         * to its subnodes. Null in the case of leaf nodes.
         * @type Number[3]
         */
        this._center = null;
        /*
         * The minimum and maximum coordinates for the 3 axes where any part of any of the contained spacecrafts reside.
         * @type Number[2][3]
         */
        this._boundaries = null;
        if (this._objects.length > 0) {
            this._calculateCenter(isRootNode);
        }
        /**
         * The subnodes of this node, or null in case of leaf nodes.
         * @type Octree[8]
         */
        this._subnodes = (maximumDepth > 0) && (this._objects.length > maximumObjectCount) ? this._generateSubnodes(maximumDepth - 1, maximumObjectCount) : null;
    }
    /**
     * Calculates and saves the center point for this node based on the associated spacecrafts. (their average position)
     * @param {Boolean} [isRootNode=false] If true, also calculates and saves boundaries.
     */
    Octree.prototype._calculateCenter = function (isRootNode) {
        var i, n, x = 0, y = 0, z = 0, p, s;
        if (isRootNode) {
            p = this._objects[0].getPhysicalModel().getPositionMatrix();
            s = this._objects[0].getPhysicalModel().getSize();
            this._boundaries = [[p[0] - s, p[0] + s], [p[1] - s, p[1] + s], [p[2] - s, p[2] + s]];
        }
        for (i = 0, n = this._objects.length; i < n; i++) {
            p = this._objects[i].getPhysicalModel().getPositionMatrix();
            x += p[12];
            y += p[13];
            z += p[14];
            if (isRootNode) {
                s = this._objects[i].getPhysicalModel().getSize();
                if ((p[12] - s) < this._boundaries[0][0]) {
                    this._boundaries[0][0] = p[12] - s;
                }
                if ((p[12] + s) > this._boundaries[0][1]) {
                    this._boundaries[0][1] = p[12] + s;
                }
                if ((p[13] - s) < this._boundaries[1][0]) {
                    this._boundaries[1][0] = p[13] - s;
                }
                if ((p[13] + s) > this._boundaries[1][1]) {
                    this._boundaries[1][1] = p[13] + s;
                }
                if ((p[14] - s) < this._boundaries[2][0]) {
                    this._boundaries[2][0] = p[14] - s;
                }
                if ((p[14] + s) > this._boundaries[2][1]) {
                    this._boundaries[2][1] = p[14] + s;
                }
            }
        }
        x /= n;
        y /= n;
        z /= n;
        this._center = [x, y, z];
    };
    /**
     * Creates and returns the list of subnodes for this node by dividing its objects among them based on its center point and the given 
     * parameters.
     * @param {Number} maximumDepth The subnodes will generate further subnodes up to this many times.
     * @param {Number} maximumObjectCount Nodes containing this much or fewer spacecrafts will become leaf nodes and not divide them 
     * further.
     * @returns {Octree[8]}
     */
    Octree.prototype._generateSubnodes = function (maximumDepth, maximumObjectCount) {
        var
                /** @type Number */
                i, n, size,
                /** @type Object */
                o,
                /** @type Float32Array */
                p,
                /** [l]ow/[h]igh[x]/[y]/[z] 
                 * @type Array */
                lxlylz, lxlyhz, lxhylz, lxhyhz, hxlylz, hxlyhz, hxhylz, hxhyhz, result;
        for (i = 0, n = this._objects.length; i < n; i++) {
            o = this._objects[i];
            p = o.getPhysicalModel().getPositionMatrix();
            size = o.getPhysicalModel().getSize();
            if ((p[12] - size) < this._center[0]) {
                if ((p[13] - size) < this._center[1]) {
                    if ((p[14] - size) < this._center[2]) {
                        lxlylz = lxlylz || [];
                        lxlylz.push(o);
                    }
                    if ((p[14] + size) >= this._center[2]) {
                        lxlyhz = lxlyhz || [];
                        lxlyhz.push(o);
                    }
                }
                if ((p[13] + size) >= this._center[1]) {
                    if ((p[14] - size) < this._center[2]) {
                        lxhylz = lxhylz || [];
                        lxhylz.push(o);
                    }
                    if ((p[14] + size) >= this._center[2]) {
                        lxhyhz = lxhyhz || [];
                        lxhyhz.push(o);
                    }
                }
            }
            if ((p[12] + size) >= this._center[0]) {
                if ((p[13] - size) < this._center[1]) {
                    if ((p[14] - size) < this._center[2]) {
                        hxlylz = hxlylz || [];
                        hxlylz.push(o);
                    }
                    if ((p[14] + size) >= this._center[2]) {
                        hxlyhz = hxlyhz || [];
                        hxlyhz.push(o);
                    }
                }
                if ((p[13] + size) >= this._center[1]) {
                    if ((p[14] - size) < this._center[2]) {
                        hxhylz = hxhylz || [];
                        hxhylz.push(o);
                    }
                    if ((p[14] + size) >= this._center[2]) {
                        hxhyhz = hxhyhz || [];
                        hxhyhz.push(o);
                    }
                }
            }
        }
        result = new Array(8);
        result[0] = new Octree(lxlylz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[1] = new Octree(lxlyhz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[2] = new Octree(lxhylz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[3] = new Octree(lxhyhz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[4] = new Octree(hxlylz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[5] = new Octree(hxlyhz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[6] = new Octree(hxhylz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        result[7] = new Octree(hxhyhz || utils.EMPTY_ARRAY, maximumDepth, maximumObjectCount, false);
        return result;
    };
    /**
     * Returns the list of spacecrafts inside the region specified by the given boundaries using the spatial partitions represented by this
     * node and its subnodes.
     * @param {Number} minX
     * @param {Number} maxX
     * @param {Number} minY
     * @param {Number} maxY
     * @param {Number} minZ
     * @param {Number} maxZ
     * @returns {Spacecraft[]}
     */
    Octree.prototype.getObjects = function (minX, maxX, minY, maxY, minZ, maxZ) {
        var result;
        if (!this._subnodes) {
            return this._objects;
        }
        if (this._boundaries) {
            if ((maxX < this._boundaries[0][0]) || (minX > this._boundaries[0][1]) ||
                    (maxY < this._boundaries[1][0]) || (minY > this._boundaries[1][1]) ||
                    (maxZ < this._boundaries[2][0]) || (minZ > this._boundaries[2][1])) {
                return utils.EMPTY_ARRAY;
            }
        }
        result = [];
        if (minX < this._center[0]) {
            if (minY < this._center[1]) {
                if (minZ < this._center[2]) {
                    result = result.concat(this._subnodes[0].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
                if (maxZ >= this._center[2]) {
                    result = result.concat(this._subnodes[1].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
            }
            if (maxY >= this._center[1]) {
                if (minZ < this._center[2]) {
                    result = result.concat(this._subnodes[2].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
                if (maxZ >= this._center[2]) {
                    result = result.concat(this._subnodes[3].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
            }
        }
        if (maxX >= this._center[0]) {
            if (minY < this._center[1]) {
                if (minZ < this._center[2]) {
                    result = result.concat(this._subnodes[4].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
                if (maxZ >= this._center[2]) {
                    result = result.concat(this._subnodes[5].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
            }
            if (maxY >= this._center[1]) {
                if (minZ < this._center[2]) {
                    result = result.concat(this._subnodes[6].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
                if (maxZ >= this._center[2]) {
                    result = result.concat(this._subnodes[7].getObjects(minX, maxX, minY, maxY, minZ, maxZ));
                }
            }
        }
        return result;
    };
    // #########################################################################
    /**
     * @class Represents a battle scene with an environment, spacecrafts, 
     * projectiles. Can create scenes for visual representation using the held
     * references as well as perform the game logic and physics simulation
     * among the contained objects.
     * @returns {Level}
     */
    function Level() {
        /**
         * Stores the attributes of the environment where this level is situated.
         * @type Environment
         */
        this._environment = null;
        /**
         * Whether this level has an own environment created by itself (described in the level JSON)
         * or just refers one from the common environments. (if the latter is the case, the referred environment cannot be destroyed when
         * this level is destroyed)
         * @type Boolean
         */
        this._ownsEnvironment = false;
        /**
         * The list of views that will be used to add camera configurations to the scene of this level. The first element of this list
         * will be the starting camera configuration.
         * @type SceneView[]
         */
        this._views = null;
        /**
         * The list of valid string IDs for teams in this level (so that IDs can be validated against this list to detect typos)
         * @type String[]
         */
        this._teams = null;
        /**
         * The list of spacecrafts that are placed on the map of this level.
         * @type Spacecraft[]
         */
        this._spacecrafts = null;
        /**
         * A reference to the spacecraft piloted by the player.
         * @type Spacecraft
         */
        this._pilotedCraft = null;
        /**
         * A list of references to all the physical objects that take part in
         * collision / hit check in this level to easily pass them to such
         * simulation methods.
         * @type PhysicalObject[]
         */
        this._hitObjects = null;
        /**
         * The amount of randomly positioned ships to add to the level at start by class
         * @type Object.<String, Number>
         */
        this._randomShips = null;
        /**
         * The random ships will be added in random positions within a box of this width, height and depth centered at the origo
         * @type Number
         */
        this._randomShipsMapSize = 0;
        /**
         * The added random ships are rotated around the Z axis by this angle (in degrees)
         * @type Number
         */
        this._randomShipsHeadingAngle = 0;
        /**
         * Whether to rotate the added random ships to a random heading (around axis Z)
         * @type Boolean
         */
        this._randomShipsRandomHeading = false;
        /**
         * The added random ships will be equipped with the profile having this name, if they have such
         * @type string
         */
        this._randomShipsEquipmentProfileName = null;
    }
    // #########################################################################
    // indirect getters and setters
    /**
     * Returns the currently piloted spacecraft.
     * @returns {Spacecraft}
     */
    Level.prototype.getPilotedSpacecraft = function () {
        if (this._pilotedCraft !== null && !this._pilotedCraft.canBeReused()) {
            return this._pilotedCraft;
        }
        return null;
    };
    /**
     * Returns the spacecraft added to this level that is identified by the given id. Returns null if such spacecraft does not exist.
     * @param {String} id
     * @returns {Spacecraft}
     */
    Level.prototype.getSpacecraft = function (id) {
        var i;
        for (i = 0; i < this._spacecrafts.length; i++) {
            if (this._spacecrafts[i].getID() === id) {
                return this._spacecrafts[i];
            }
        }
        return null;
    };
    /**
     * Calls the passed function for every spacecraft this level has, passing each of the spacecrafts as its single argument
     * @param {Function} method
     */
    Level.prototype.applyToSpacecrafts = function (method) {
        var i;
        for (i = 0; i < this._spacecrafts.length; i++) {
            method(this._spacecrafts[i]);
        }
    };
    /**
     * Returns whether according to the current state of the level, the controlled spacecraft has won.
     * @returns {Boolean}
     */
    Level.prototype.isWon = function () {
        var i, craft = this.getPilotedSpacecraft();
        if (craft) {
            for (i = 0; i < this._spacecrafts.length; i++) {
                if (this._spacecrafts[i] && !this._spacecrafts[i].canBeReused() && craft.isHostile(this._spacecrafts[i])) {
                    return false;
                }
            }
            return true;
        }
        return false;
    };
    /**
     * Returns whether there are no spacecrafts present in the level that are hostiles towards each other
     * @returns {Boolean}
     */
    Level.prototype.noHostilesPresent = function () {
        var i, team = null, spacecraftTeam;
        for (i = 0; i < this._spacecrafts.length; i++) {
            if (this._spacecrafts[i] && !this._spacecrafts[i].canBeReused()) {
                spacecraftTeam = this._spacecrafts[i].getTeam();
                if (spacecraftTeam && team && (spacecraftTeam !== team)) {
                    return false;
                }
                team = spacecraftTeam;
            }
        }
        return true;
    };
    /**
     * Returns whether according to the current state of the level, the controlled spacecraft has lost. 
     * @returns {Boolean}
     */
    Level.prototype.isLost = function () {
        return !this._pilotedCraft || this._pilotedCraft.canBeReused();
    };
    /**
     * Returns whether the passed spacecraft has the given renderable object as its visual model.
     * @param {RenderableObject} visualModel
     * @param {Spacecraft} spacecraft
     * @returns {Boolean}
     */
    Level.prototype._spacecraftHasVisualModel = function (visualModel, spacecraft) {
        return spacecraft.getVisualModel() === visualModel;
    };
    /**
     * Returns the spacecraft from this level that the current view is following in the passed scene, if any.
     * @param {Scene} scene
     * @returns {Spacecraft|null}
     */
    Level.prototype.getFollowedSpacecraftForScene = function (scene) {
        return scene.getCamera().getFollowedNode() ?
                this._spacecrafts.find(this._spacecraftHasVisualModel.bind(this, scene.getCamera().getFollowedNode().getRenderableObject())) :
                null;
    };
    /**
     * Returns the team with the given ID from the list of teams added to this level.
     * @param {String} id
     * @returns {Team}
     */
    Level.prototype.getTeam = function (id) {
        var i;
        for (i = 0; i < this._teams.length; i++) {
            if (this._teams[i].getID() === id) {
                return this._teams[i];
            }
        }
        application.showError("No team exists with ID '" + id + "'!");
        return null;
    };
    // #########################################################################
    // methods
    /**
     * Sends an asynchronous request to grab the file with the passed name from
     * the level folder and initializes the level data when the file has been
     * loaded.
     * @param {String} filename
     * @param {Boolean} demoMode If true, the data from the level file will be loaded in demo mode, so that the piloted craft is not set
     * and a suitable AI is added to all spacecrafts if possible.
     * @param {Function} [callback] An optional function to execute after the
     * level has been loaded.
     */
    Level.prototype.requestLoadFromFile = function (filename, demoMode, callback) {
        application.requestTextFile(config.getConfigurationSetting(config.CONFIGURATION.LEVEL_FILES).folder, filename, function (responseText) {
            this.loadFromJSON(JSON.parse(responseText), demoMode);
            if (callback) {
                callback();
            }
        }.bind(this));
    };
    /**
     * Loads all the data describing this level from the passed JSON object. Does not add random ships to the level, only loads their 
     * configuration - they can be added by calling addRandomShips() later, which will use the loaded configuration.
     * @param {Object} dataJSON
     * @param {Boolean} demoMode If true, the data from the JSON object will be loaded in demo mode, so that the piloted craft is not set
     * and a suitable AI is added to all spacecrafts if possible.
     */
    Level.prototype.loadFromJSON = function (dataJSON, demoMode) {
        var i, craft, teamID, team, aiType;
        application.log("Loading level from JSON file...", 2);
        if (dataJSON.environment.createFrom) {
            this._environment = _context.getEnvironment(dataJSON.environment.createFrom);
            if (!this._environment) {
                application.showError("Cannot load environment '" + dataJSON.environment.createFrom + "' for level: no such environment exists!");
            }
            this._ownsEnvironment = false;
        } else {
            this._environment = new Environment(dataJSON.environment);
            this._ownsEnvironment = true;
        }
        this._teams = [];
        if (dataJSON.teams) {
            for (i = 0; i < dataJSON.teams.length; i++) {
                this._teams.push(new Team(dataJSON.teams[i]));
            }
        }
        this._views = [];
        if (dataJSON.views) {
            for (i = 0; i < dataJSON.views.length; i++) {
                this._views.push(new classes.SceneView(dataJSON.views[i]));
            }
        }
        this._spacecrafts = [];
        ai.clearAIs();
        for (i = 0; i < dataJSON.spacecrafts.length; i++) {
            craft = new spacecraft.Spacecraft();
            craft.loadFromJSON(dataJSON.spacecrafts[i], this._spacecrafts);
            if (!demoMode && dataJSON.spacecrafts[i].piloted) {
                this._pilotedCraft = craft;
            }
            aiType = dataJSON.spacecrafts[i].ai;
            if (!aiType && demoMode) {
                if (craft.isFighter()) {
                    aiType = config.getSetting(config.BATTLE_SETTINGS.DEMO_FIGHTER_AI_TYPE);
                } else {
                    aiType = config.getSetting(config.BATTLE_SETTINGS.DEMO_SHIP_AI_TYPE);
                }
            }
            if (aiType) {
                ai.addAI(aiType, craft);
            }
            teamID = dataJSON.spacecrafts[i].team;
            if (teamID) {
                team = this.getTeam(teamID);
                if (team) {
                    craft.setTeam(team);
                } else {
                    application.showError("Invalid team ID '" + teamID + "' specified for " + craft.getClassName() + "!");
                }
            } else if (demoMode) {
                team = new Team({
                    name: GENERIC_TEAM_NAME,
                    id: (this._teams.length + 1).toString()
                });
                this._teams.push(team);
                craft.setTeam(team);
            }
            this._spacecrafts.push(craft);
        }
        // loading predefined initial targets
        for (i = 0; i < dataJSON.spacecrafts.length; i++) {
            if (dataJSON.spacecrafts[i].initialTarget) {
                this._spacecrafts[i].setTarget(this.getSpacecraft(dataJSON.spacecrafts[i].initialTarget));
            }
        }
        this._randomShips = dataJSON.randomShips || {};
        this._randomShipsMapSize = dataJSON.randomShipsMapSize;
        this._randomShipsHeadingAngle = dataJSON.randomShipsHeadingAngle || 0;
        this._randomShipsRandomHeading = dataJSON.randomShipsRandomHeading || false;
        this._randomShipsEquipmentProfileName = dataJSON.randomShipsEquipmentProfileName || config.BATTLE_SETTINGS.DEFAULT_EQUIPMENT_PROFILE_NAME;
        application.log("Level successfully loaded.", 2);
    };
    /**
     * Adds spacecrafts to the level at random positions based on the configuration loaded from JSON before.
     * @param {Number} [randomSeed]
     * @param {Boolean} demoMode If true, a suitable AI and a unique team will be set for each added random ship.
     */
    Level.prototype.addRandomShips = function (randomSeed, demoMode) {
        var random, shipClass, craft, team, i, orientation, orientationMatrix = mat.rotation4([0, 0, 1], Math.radians(this._randomShipsHeadingAngle));
        randomSeed = randomSeed || config.getSetting(config.GENERAL_SETTINGS.DEFAULT_RANDOM_SEED);
        random = Math.seed(randomSeed);
        for (shipClass in this._randomShips) {
            if (this._randomShips.hasOwnProperty(shipClass)) {
                for (i = 0; i < this._randomShips[shipClass]; i++) {
                    orientation = orientationMatrix ?
                            mat.matrix4(orientationMatrix) : mat.identity4();
                    if (this._randomShipsRandomHeading) {
                        mat.mul4(orientation, mat.rotation4(mat.getRowC4(orientation), random() * Math.PI * 2));
                    }
                    craft = new spacecraft.Spacecraft(
                            classes.getSpacecraftClass(shipClass),
                            "",
                            mat.translation4(random() * this._randomShipsMapSize - this._randomShipsMapSize / 2, random() * this._randomShipsMapSize - this._randomShipsMapSize / 2, random() * this._randomShipsMapSize - this._randomShipsMapSize / 2),
                            orientation,
                            this._randomShipsEquipmentProfileName,
                            this._spacecrafts);
                    if (demoMode) {
                        if (craft.isFighter()) {
                            ai.addAI(config.getSetting(config.BATTLE_SETTINGS.DEMO_FIGHTER_AI_TYPE), craft);
                        } else {
                            ai.addAI(config.getSetting(config.BATTLE_SETTINGS.DEMO_SHIP_AI_TYPE), craft);
                        }
                        team = new Team({
                            name: GENERIC_TEAM_NAME,
                            id: (this._teams.length + 1).toString()
                        });
                        this._teams.push(team);
                        craft.setTeam(team);
                    }
                    this._spacecrafts.push(craft);
                }
            }
        }
    };
    /**
     * Creates and returns a camera configuration for this given view set up according to the scene view's parameters.
     * @param {SceneView} view
     * @param {Scene} scene
     * @returns {CameraConfiguration} The created camera configuration.
     */
    Level.prototype.createCameraConfigurationForSceneView = function (view, scene) {
        var positionConfiguration, orientationConfiguration, angles = mat.getYawAndPitch(view.getOrientationMatrix());
        positionConfiguration = new camera.CameraPositionConfiguration(
                !view.isMovable(),
                view.turnsAroundObjects(),
                view.movesRelativeToObject(),
                view.getPositionFollowedObjectsForScene(scene),
                view.startsWithRelativePosition(),
                mat.matrix4(view.getPositionMatrix()),
                view.getDistanceRange(),
                view.getConfines(),
                view.resetsWhenLeavingConfines());
        orientationConfiguration = new camera.CameraOrientationConfiguration(
                !view.isTurnable(),
                view.pointsTowardsObjects(),
                view.isFPS(),
                view.getOrientationFollowedObjectsForScene(scene),
                mat.matrix4(view.getOrientationMatrix()),
                Math.degrees(angles.yaw), Math.degrees(angles.pitch),
                view.getAlphaRange(),
                view.getBetaRange(),
                view.getBaseOrientation() || config.getDefaultCameraBaseOrientation(),
                view.getPointToFallback() || config.getDefaultCameraPointToFallback());
        return new camera.CameraConfiguration(
                view.getName(),
                positionConfiguration, orientationConfiguration,
                view.getFOV() || config.getDefaultCameraFOV(),
                view.getFOVRange() || config.getDefaultCameraFOVRange(),
                view.getSpan() || config.getDefaultCameraSpan(),
                view.getSpanRange() || config.getDefaultCameraSpanRange(),
                view.resetsOnFocusChange());
    };
    /**
     * Adds renderable objects representing all visual elements of the level to
     * the passed scene.
     * @param {Scene} battleScene
     * @param {Scene} targetScene
     */
    Level.prototype.addToScene = function (battleScene, targetScene) {
        var i;
        if (this._environment) {
            this._environment.addToScene(battleScene);
        }
        this._hitObjects = [];
        for (i = 0; i < this._spacecrafts.length; i++) {
            this._spacecrafts[i].addToScene(battleScene, undefined, false, {
                hitboxes: true,
                weapons: true,
                thrusterParticles: true,
                projectileResources: true,
                explosion: true,
                cameraConfigurations: true,
                lightSources: true,
                blinkers: true
            }, {
                randomAnimationTime: true
            });
            if (targetScene) {
                this._spacecrafts[i].addToScene(targetScene, graphics.getMaxLoadedLOD(), true, {
                    weapons: true
                }, {
                    shaderName: config.getSetting(config.BATTLE_SETTINGS.HUD_TARGET_VIEW_TARGET_ITEM_SHADER)
                });
            }
            this._hitObjects.push(this._spacecrafts[i]);
        }
        resources.executeWhenReady(function () {
            for (i = 0; i < this._views.length; i++) {
                battleScene.addCameraConfiguration(this.createCameraConfigurationForSceneView(this._views[i], battleScene));
                if (i === 0) {
                    battleScene.getCamera().followNode(null, true, 0);
                    battleScene.getCamera().update(0);
                }
            }
        }.bind(this));
    };
    /**
     * Toggles the visibility of the hitboxes of all spacecrafts in the level.
     */
    Level.prototype.toggleHitboxVisibility = function () {
        var i;
        for (i = 0; i < this._spacecrafts.length; i++) {
            this._spacecrafts[i].toggleHitboxVisibility();
        }
    };
    /**
     * Function to execute during every simulation step on projectiles taken from the projectile pool
     * @param {Number} dt The elapsed time since the last simulation step
     * @param {Octree} octree An octree containing the objects that can be hit by the projectiles
     * @param {Projectile} projectile The projectile to handle 
     * @param {Number} indexInPool The index of the projectile within the projectile pool
     */
    Level._handleProjectile = function (dt, octree, projectile, indexInPool) {
        projectile.simulate(dt, octree);
        if (projectile.canBeReused()) {
            _projectilePool.markAsFree(indexInPool);
        }
    };
    /**
     * Function to execute during every simulation step on particles taken from the particle pool
     * @param {Particle} particle The particle to handle
     * @param {Number} indexInPool The index of the particle within the particle pool
     */
    Level._handleParticle = function (particle, indexInPool) {
        if (particle.canBeReused()) {
            _particlePool.markAsFree(indexInPool);
        }
    };
    /**
     * Performs the physics and game logic simulation of all the object in the
     * level.
     * @param {Number} dt The time passed since the last simulation step, in milliseconds.
     * @param {Scene} mainScene When given, this scene is updated according to the simulation.
     */
    Level.prototype.tick = function (dt, mainScene) {
        var i, v, octree;
        if (this._environment) {
            this._environment.simulate();
        }
        for (i = 0; i < this._spacecrafts.length; i++) {
            this._spacecrafts[i].simulate(dt);
            if ((this._spacecrafts[i] === undefined) || (this._spacecrafts[i].canBeReused())) {
                this._spacecrafts[i].destroy();
                this._spacecrafts[i] = null;
                this._spacecrafts.splice(i, 1);
                this._hitObjects[i] = null;
                this._hitObjects.splice(i, 1);
                i--;
            } else if (_showHitboxesForHitchecks) {
                this._spacecrafts[i].hideHitbox();
            }
        }
        if (_projectilePool.hasLockedObjects()) {
            octree = new Octree(this._hitObjects, 2, 1, true);
            _projectilePool.executeForLockedObjects(Level._handleProjectile.bind(this, dt, octree));
        }
        if (_particlePool.hasLockedObjects()) {
            _particlePool.executeForLockedObjects(Level._handleParticle);
        }
        // moving the scene back to the origo if the camera is too far away to avoid floating point errors becoming visible
        if (mainScene) {
            v = mainScene.moveCameraToOrigoIfNeeded(config.getSetting(config.BATTLE_SETTINGS.MOVE_TO_ORIGO_DISTANCE));
            if (v) {
                ai.handleSceneMoved(v);
            }
        }
        if (application.isDebugVersion()) {
            _debugInfo =
                    "Part: " + _particlePool._objects.length + "<br/>" +
                    "Proj: " + _projectilePool._objects.length;
        }
    };
    /**
     * Removes all references to other objects for proper cleanup of memory.
     */
    Level.prototype.destroy = function () {
        var i;
        if (this._environment && this._ownsEnvironment) {
            this._environment.destroy();
        }
        this._environment = null;
        if (this._views) {
            for (i = 0; i < this._views.length; i++) {
                if (this._views[i]) {
                    this._views[i].destroy();
                    this._views[i] = null;
                }
            }
            this._views = null;
        }
        if (this._spacecrafts) {
            for (i = 0; i < this._spacecrafts.length; i++) {
                if (this._spacecrafts[i]) {
                    this._spacecrafts[i].destroy();
                    this._spacecrafts[i] = null;
                }
            }
            this._spacecrafts = null;
        }
        this._pilotedCraft = null;
        this._hitObjects = null;
        _particlePool.clear();
        _projectilePool.clear();
    };
    // initializazion
    // obtaining pool references
    _particlePool = pools.getPool(renderableObjects.Particle);
    _projectilePool = pools.getPool(equipment.Projectile);
    // creating the default context
    _context = new LogicContext();
    // caching configuration settings
    config.executeWhenReady(function () {
        _showHitboxesForHitchecks = config.getSetting(config.BATTLE_SETTINGS.SHOW_HITBOXES_FOR_HITCHECKS);
    });
    // -------------------------------------------------------------------------
    // The public interface of the module
    return {
        requestEnvironmentsLoad: _context.requestEnvironmentsLoad.bind(_context),
        executeWhenReady: _context.executeWhenReady.bind(_context),
        getDebugInfo: getDebugInfo,
        getEnvironment: _context.getEnvironment.bind(_context),
        getEnvironmentNames: _context.getEnvironmentNames.bind(_context),
        createEnvironment: _context.createEnvironment.bind(_context),
        executeForAllEnvironments: _context.executeForAllEnvironments.bind(_context),
        Skybox: Skybox,
        Level: Level
    };
});