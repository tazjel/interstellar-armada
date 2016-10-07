/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file Provides a capable camera class to use with scenes.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 2.0
 */

/*jslint nomen: true, plusplus: true, bitwise: true, white: true */
/*global define, Float32Array, Int32Array */

/**
 * @param utils Used for array equality check.
 * @param vec Used for 3D (and 4D) vector operations.
 * @param mat Used for 3D (and 4D) matrix operations.
 * @param application Used for displaying errors and logging (and intentional crashing)
 * @param object3D The Camera is an Object3D mixin class
 */
define([
    "utils/utils",
    "utils/vectors",
    "utils/matrices",
    "modules/application",
    "modules/scene/object-3d"
], function (utils, vec, mat, application, object3D) {
    "use strict";
    // ----------------------------------------------------------------------
    // constants
    var
            /**
             * The minimum alpha angle for FPS-mode camera configurations that were created without specifying it
             * @type Number
             */
            DEFAULT_MIN_ALPHA = -360,
            /**
             * The maximum alpha angle for FPS-mode camera configurations that were created without specifying it
             * @type Number
             */
            DEFAULT_MAX_ALPHA = 360,
            /**
             * The minimum beta angle for FPS-mode camera configurations that were created without specifying it
             * @type Number
             */
            DEFAULT_MIN_BETA = -90,
            /**
             * The maximum beta angle for FPS-mode camera configurations that were created without specifying it
             * @type Number
             */
            DEFAULT_MAX_BETA = 90,
            /**
             * When decreased by one step, the field of view of a camera will be multiplied by this factor
             * @type Number
             */
            FOV_DECREASE_FACTOR = 0.95,
            /**
             * When increased by one step, the field of view of a camera will be multiplied by this factor
             * @type Number
             */
            FOV_INCREASE_FACTOR = 1.05,
            /**
             * When decreased by one step, the span of a camera will be multiplied by this factor
             * @type Number
             */
            SPAN_DECREASE_FACTOR = 0.95,
            /**
             * When increased by one step, the span of a camera will be multiplied by this factor
             * @type Number
             */
            SPAN_INCREASE_FACTOR = 1.05,
            /**
             * The camera used for rendering the distance render queues will have a view distance that is the view distance of the regular
             * camera multiplied by this factor.
             * @type Number
             */
            CAMERA_EXTENSION_FACTOR = 5;
    // #########################################################################
    /**
     * @class This class can update and compute the world position of a camera based on the related configuration settings, which it stores.
     * @param {Boolean} fixed Whether the camera position should be locked and not be movable by the user
     * @param {Boolean} turnsAroundObjects If true, the camera position can be changed by rotating it, as it will be calculated relative to
     * the followed object(s) and the orientation of the camera. If not fixed, "zooming" on a straight line towards/away from the object(s)
     * is possible as well
     * @param {Boolean} movesRelativeToObject If true, the movement of the camera will happen along the axes of the orientation of the first
     * followed object (if any)
     * @param {Object3D[]} followedObjects The list of objects the camera's position should follow. Setting no objects means the set 
     * position is absolute, setting multiple objects means the average of their positions will be followed.
     * @param {Boolean} startsWithRelativePosition Whether only at the start and at default resets should the position be calculated as
     * relative (and not follow the followed objects continuously)
     * @param {Float32Array} positionMatrix The set position. Might mean the absolute (world) or relative position depending on other settings.
     * The final world position is always calculated and not set.
     * @param {Number[2]} distanceRange If the camera turns around the followed objects and it is not fixed, this is the range in which the
     * distance from the objects is allowed to change
     * @param {Number[3][2]} [confines] If given, the movement of the camera will be limited to the specified ranges on the 3 axes, 
     * respectively. It is possible to specify confinement on select axes only, in which case null should be passed as range for the other
     * axes.
     * @param {Boolean} resetsWhenLeavingConfines Whether a reset to defaults should automatically be called whenever the camera position 
     * leaves the area determined by its confines (distance, X, Y or Z)
     * @param {Boolean} [isTransitionConfiguration=false] If true, the configuration will serve as a suitable starting point for 
     * transitions, as it will not perform major updates (resets, changes) and the checks necessary for them (confine checks, object 
     * cleanup). Such a copy can be made from a configuration and then use it to transition to the regular configuration which gets properly
     * updated to provide a smooth transition between the non-updated and updated state
     */
    function CameraPositionConfiguration(fixed, turnsAroundObjects, movesRelativeToObject, followedObjects, startsWithRelativePosition, positionMatrix, distanceRange, confines, resetsWhenLeavingConfines, isTransitionConfiguration) {
        /**
         * If true, the camera position can't be controlled by the player, but is automatically
         * calculated. The absolute position might still change e.g. if it is relative to objects
         * in the scene.
         * @type Boolean
         */
        this._fixed = fixed;
        /**
         * If true, the position is relative not just to the position of the followed point, but also
         * to the direction that the camera points towards - if the orientation of the camera changes,
         * the position is recalculated, turning around the followed point.
         * @type Boolean
         */
        this._turnsAroundObjects = turnsAroundObjects;
        /**
         * If true, the movement of the camera will happen along the axes of the orientation of the first
         * followed object (if any)
         */
        this._movesRelativeToObject = movesRelativeToObject;
        /**
         * The list of objects the camera is following. If empty, the camera is free to move around
         * or has a constant absolute position if fixed. If more than one object is in the list, the camera
         * follows the point in space which is the average of the positions of the objects.
         * @type Object3D[]
         */
        this._followedObjects = followedObjects || [];
        /**
         * If true, the given position is taken as relative to the followed object(s), but only at the first step after setting this 
         * configuration for a new camera or resetting the configuration. After that, instead of following the objects using a relative
         * position, it will switch to world-position (absolute) mode, and stay at the same place (or can be moved from it)
         * @type Boolean
         */
        this._startsWithRelativePosition = startsWithRelativePosition;
        /**
         * Stores a copy of the starting relative position matrix so it can be reset to it later.
         * @type Float32Array
         */
        this._defaultRelativePositionMatrix = mat.matrix4(positionMatrix);
        /**
         * Describes the relative position stored in this configuration. Not the same as the world position of the camera
         * itself, as it can be relative to followed objects and the camera direction.
         * @type Float32Array
         */
        this._relativePositionMatrix = positionMatrix;
        /**
         * Describes the position of the camera in the world. This is calculated based on the other
         * properties and cannot be set directly.
         * @type Float32Array
         */
        this._worldPositionMatrix = null;
        /**
         * Whether the distance from the followed objects is confined to certain limits
         * @type Boolean
         */
        this._distanceIsConfined = distanceRange ? true : false;
        /**
         * If objects are followed and turnsAroundObjects is true, movement of the camera is possible by "zooming", bringing it closer
         * or farther to the followed objects on a straight line (the direction of which is based on the position matrix).
         * This value marks the closest distance.
         * @type Number
         */
        this._minimumDistance = distanceRange ? distanceRange[0] : 0;
        /**
         * See minimum distance for detailed explanation. This value marks the maximum distance. 
         * @type Number
         */
        this._maximumDistance = distanceRange ? distanceRange[1] : 0;
        /**
         * Whether the movement of the camera is limited to a certain range on axis X
         * @type Boolean
         */
        this._xIsConfined = (confines && confines[0]) ? true : false;
        /**
         * The minimum value of the X coordinate of the camera, if confined on axis X
         * @type Number
         */
        this._minimumX = (confines && confines[0]) ? confines[0][0] : 0;
        /**
         * The maximum value of the X coordinate of the camera, if confined on axis X
         * @type Number
         */
        this._maximumX = (confines && confines[0]) ? confines[0][1] : 0;
        /**
         * Whether the movement of the camera is limited to a certain range on axis Y
         * @type Boolean
         */
        this._yIsConfined = (confines && confines[1]) ? true : false;
        /**
         * The minimum value of the Y coordinate of the camera, if confined on axis Y
         * @type Number
         */
        this._minimumY = (confines && confines[1]) ? confines[1][0] : 0;
        /**
         * The maximum value of the Y coordinate of the camera, if confined on axis Y
         * @type Number
         */
        this._maximumY = (confines && confines[1]) ? confines[1][1] : 0;
        /**
         * Whether the movement of the camera is limited to a certain range on axis Z
         * @type Boolean
         */
        this._zIsConfined = (confines && confines[2]) ? true : false;
        /**
         * The minimum value of the Z coordinate of the camera, if confined on axis Z
         * @type Number
         */
        this._minimumZ = (confines && confines[2]) ? confines[2][0] : 0;
        /**
         * The maximum value of the Z coordinate of the camera, if confined on axis Z
         * @type Number
         */
        this._maximumZ = (confines && confines[2]) ? confines[2][1] : 0;
        /**
         * Whether a reset to defaults should automatically be called whenever the camera position leaves the area determined by its 
         * confines (distance, X, Y or Z)
         * @type Boolean
         */
        this._resetsWhenLeavingConfines = resetsWhenLeavingConfines;
        /**
         * If true, the configuration serves as a suitable starting point for transitions, as it will not perform major updates (resets, 
         * changes) and the checks necessary for them (confine checks, object cleanup). 
         */
        this._isTransitionConfiguration = isTransitionConfiguration;
        /**
         * Whether the current (next) simulation step is a starting step
         * @type Boolean
         */
        this._isStarting = true;
        /**
         * A reference to the camera that currently uses this position configuration
         * @type Camera
         */
        this._camera = null;
    }
    /**
     * Returns a camera position configuration with the same settings as this one, cloning referenced values to make sure changes to this
     * configuration do not affect the created copy.
     * @param {Boolean} [transitionCopy=false] Create a copy that serves as a transition configuration (not doing object cleanup, confine
     * checks, only regular following of position)
     * @returns {CameraPositionConfiguration}
     */
    CameraPositionConfiguration.prototype.copy = function (transitionCopy) {
        var result = new CameraPositionConfiguration(
                this._fixed,
                this._turnsAroundObjects,
                this._movesRelativeToObject,
                this._followedObjects.slice(),
                this._startsWithRelativePosition,
                mat.matrix4(this._defaultRelativePositionMatrix),
                this._distanceIsConfined ? [this._minimumDistance, this._maximumDistance] : null,
                [
                    this._xIsConfined ? [this._minimumX, this._maximumX] : null,
                    this._yIsConfined ? [this._minimumY, this._maximumY] : null,
                    this._zIsConfined ? [this._minimumZ, this._maximumZ] : null
                ],
                this._resetsWhenLeavingConfines,
                transitionCopy);
        result._relativePositionMatrix = mat.matrix4(this._relativePositionMatrix);
        result._worldPositionMatrix = mat.matrix4(this._worldPositionMatrix);
        result._isStarting = this._isStarting;
        return result;
    };
    /**
     * Sets the reference to the camera currently using this position configuration. Configurations with relative starting position are 
     * automatically reset when a new camera is assigned to them, so that they start from a refreshed relative position
     * @param {Camera} value
     * @param {Boolean} [doNotReset=false] If true, the automatic configuration reset will be suppressed 
     */
    CameraPositionConfiguration.prototype.setCamera = function (value, doNotReset) {
        if (value && (this._camera !== value) && this._startsWithRelativePosition && !doNotReset) {
            this.resetToDefaults(true);
        }
        this._camera = value;
    };
    /**
     * Resets the configuration to its initial state.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this reset
     */
    CameraPositionConfiguration.prototype.resetToDefaults = function (doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.positionConfigurationWillChange();
        }
        mat.setMatrix4(this._relativePositionMatrix, this._defaultRelativePositionMatrix);
        this._worldPositionMatrix = null;
        this._isStarting = true;
    };
    /**
     * Directly sets a new relative position matrix for this configuration.
     * @param {Float32Array} value A 4x4 translation matrix.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraPositionConfiguration.prototype.setRelativePositionMatrix = function (value, doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.positionConfigurationWillChange();
        }
        this._relativePositionMatrix = value;
    };
    /**
     * Moves the relative position of the configuration by the passed 3D vector.
     * @param {Number[3]} vector
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraPositionConfiguration.prototype.moveByVector = function (vector, doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.positionConfigurationWillChange();
        }
        mat.translateByVector(this._relativePositionMatrix, vector);
    };
    /**
     * If no parameter is given, returns whether the configuration is set to follow any objects. If a list of objects is given, returns 
     * whether this conifugation is set to follow the same list of objects.
     * @param {Object3D[]} [objects]
     * @returns {Boolean}
     */
    CameraPositionConfiguration.prototype.followsObjects = function (objects) {
        return objects ?
                utils.arraysEqual(this._followedObjects.sort(), objects.sort()) :
                ((this._followedObjects.length > 0) && !this._startsWithRelativePosition);
    };
    /**
     * Returns the 3D vector describing the current location in space that is tracked by this camera configuration.
     * The result is not a reference to any actually tracked vector, but a copy describing the current location.
     * @returns {Number[3]}
     */
    CameraPositionConfiguration.prototype.getFollowedPositionVector = function () {
        var i, positionVector = [0, 0, 0];
        if (this._followedObjects.length === 0) {
            application.crash();
        } else {
            for (i = 0; i < this._followedObjects.length; i++) {
                vec.add3(positionVector, this._followedObjects[i].getPositionVector());
            }
            positionVector = [
                positionVector[0] / this._followedObjects.length,
                positionVector[1] / this._followedObjects.length,
                positionVector[2] / this._followedObjects.length
            ];
        }
        return positionVector;
    };
    /**
     * Returns the 4x4 translation matrix describing the current location in space that is tracked by this camera configuration.
     * The result is not a reference to any actually tracked matrix, but a copy describing the current location.
     * @returns {Float32Array}
     */
    CameraPositionConfiguration.prototype.getFollowedPositionMatrix = function () {
        var i, positionMatrix = mat.identity4();
        if (this._followedObjects.length === 0) {
            application.crash();
        } else {
            for (i = 0; i < this._followedObjects.length; i++) {
                mat.translateByMatrix(positionMatrix, this._followedObjects[i].getPositionMatrix());
            }
            positionMatrix = mat.translation4(
                    positionMatrix[12] / this._followedObjects.length,
                    positionMatrix[13] / this._followedObjects.length,
                    positionMatrix[14] / this._followedObjects.length);
        }
        return positionMatrix;
    };
    /**
     * Returns the orientation matrix of the first followed object. This is necessary for calculating the relative portion of the position
     * as well as if the orientation following is set to FPS-mode with a coordinate system relative to the position-followed object.
     * @returns {Float32Array}
     */
    CameraPositionConfiguration.prototype.getFollowedObjectOrientationMatrix = function () {
        var orientation;
        if (this._followedObjects.length === 0) {
            application.crash();
        } else {
            orientation = mat.matrix4(this._followedObjects[0].getOrientationMatrix());
        }
        return orientation;
    };
    /**
     * Removes the destroyed objects from the list of followed objects.
     */
    CameraPositionConfiguration.prototype._cleanupFollowedObjects = function () {
        var i, j, k;
        for (i = 0; i < this._followedObjects.length; i++) {
            j = i;
            k = 0;
            while ((j < this._followedObjects.length) && ((!this._followedObjects[j]) || (this._followedObjects[j].canBeReused() === true))) {
                j++;
                k++;
            }
            if (k > 0) {
                this._followedObjects.splice(i, k);
                if (this._followedObjects.length === 0) {
                    mat.setMatrix4(this._relativePositionMatrix, this._worldPositionMatrix || this._relativePositionMatrix || this._defaultRelativePositionMatrix);
                }
            }
        }
    };
    /**
     * Calculates and updates the internally stored world position matrix (which is nulled out automatically whenever one of the values it 
     * depends on changes, therefore serving as a cache variable)
     * @param {Float32Array} worldOrientationMatrix The current orientation of the camera in world coordinates - needed for configurations
     * that turn around the followed object, as in those cases the relative portion of the position is calculated based on it
     */
    CameraPositionConfiguration.prototype._calculateWorldPositionMatrix = function (worldOrientationMatrix) {
        if ((this._followedObjects.length > 0) && (!this._startsWithRelativePosition || this._isStarting)) {
            this._isStarting = false;
            if (!this._turnsAroundObjects) {
                this._worldPositionMatrix = mat.translatedByM4(
                        mat.translation4m4(mat.prodTranslationRotation4(
                                this._relativePositionMatrix,
                                this.getFollowedObjectOrientationMatrix())),
                        this.getFollowedPositionMatrix());
            } else {
                if (!worldOrientationMatrix) {
                    application.crash();
                } else {
                    this._worldPositionMatrix = mat.translatedByM4(
                            mat.translation4m4(mat.prodTranslationRotation4(
                                    this._relativePositionMatrix,
                                    mat.prod3x3SubOf4(mat.rotation4([1, 0, 0], Math.PI / 2), worldOrientationMatrix))),
                            this.getFollowedPositionMatrix());
                }
            }
            if (this._startsWithRelativePosition) {
                this._relativePositionMatrix = mat.matrix4(this._worldPositionMatrix);
            }
        } else {
            this._worldPositionMatrix = mat.matrix4(this._relativePositionMatrix);
        }
    };
    /**
     * If not cached, calculates, and returns the translation matrix describing the current location of the camera in world coordinates.
     * @param {Float32Array} worldOrientationMatrix The current orientation of the camera in world coordinates - needed for configurations
     * that turn around the followed object, as in those cases the relative portion of the position is calculated based on it
     * @returns {Float32Array}
     */
    CameraPositionConfiguration.prototype.getWorldPositionMatrix = function (worldOrientationMatrix) {
        if (!this._worldPositionMatrix) {
            this._calculateWorldPositionMatrix(worldOrientationMatrix);
        }
        return this._worldPositionMatrix;
    };
    /**
     * Checks whether the configuration's position is outside the set confines, and if it is, either constraints them or resets the defaults
     * (if that option is set)
     * @param {Number[3]} [orientationFollowedObjectsPositionVector] The position vector of the object(s) followed by orientation.
     * If there is no object followed by position, then distance confines will be applied to the object(s) followed by orientation (if any)
     * @return {Boolean} Whether the position has passed all the confine checks.
     */
    CameraPositionConfiguration.prototype._checkConfines = function (orientationFollowedObjectsPositionVector) {
        var translationVector, distance, relativePositionMatrix;
        // if the position is only taken as relative at the start, then the stored relative position will actually be the world position,
        // so we need to transform it back to the actual relative position, before checking the limits
        if (this._startsWithRelativePosition && (!this._isStarting) && (this._followedObjects.length > 0)) {
            relativePositionMatrix = mat.translation4m4(mat.prodTranslationRotation4(
                    mat.translatedByM4(
                            this._relativePositionMatrix,
                            mat.inverseOfTranslation4(this.getFollowedPositionMatrix())),
                    mat.inverseOfRotation4(this.getFollowedObjectOrientationMatrix())));
        } else {
            relativePositionMatrix = this._relativePositionMatrix;
        }
        // the checks start here
        if (this._distanceIsConfined) {
            if (this._followedObjects.length > 0) {
                translationVector = mat.translationVector3(relativePositionMatrix);
                distance = vec.length3(translationVector);
                if ((distance < this._minimumDistance) || (distance > this._maximumDistance)) {
                    if ((distance > this._maximumDistance) && (this._resetsWhenLeavingConfines)) {
                        this.resetToDefaults();
                        return false;
                    }
                    distance = Math.min(Math.max(distance, this._minimumDistance), this._maximumDistance);
                    relativePositionMatrix = mat.translation4v(vec.scaled3(vec.normal3(translationVector), distance));
                }
                // if the position is absolute, we will do the distance range check from the orientation followed object (if any)
            } else if (orientationFollowedObjectsPositionVector) {
                translationVector = vec.diff3(mat.translationVector3(relativePositionMatrix), orientationFollowedObjectsPositionVector);
                distance = vec.length3(translationVector);
                if ((distance < this._minimumDistance) || (distance > this._maximumDistance)) {
                    if ((distance > this._maximumDistance) && (this._resetsWhenLeavingConfines)) {
                        // if we have absolute position and a distance confined for the orientation followed object, a reset is not possible
                        // as it would set an absolute position again which might be out of confines since it does not depend on the position
                        // of the orientation followed object
                        application.crash();
                        return false;
                    }
                    distance = Math.min(Math.max(distance, this._minimumDistance), this._maximumDistance);
                    relativePositionMatrix = mat.translation4v(vec.sum3(orientationFollowedObjectsPositionVector, vec.scaled3(vec.normal3(translationVector), distance)));
                }
            }
        }
        if (this._xIsConfined) {
            if ((relativePositionMatrix[12] < this._minimumX) || (relativePositionMatrix[12] > this._maximumX)) {
                if (this._resetsWhenLeavingConfines) {
                    this.resetToDefaults();
                    return false;
                }
                relativePositionMatrix[12] = Math.min(Math.max(relativePositionMatrix[12], this._minimumX), this._maximumX);
            }
        }
        if (this._yIsConfined) {
            if ((relativePositionMatrix[13] < this._minimumY) || (relativePositionMatrix[13] > this._maximumY)) {
                if (this._resetsWhenLeavingConfines) {
                    this.resetToDefaults();
                    return false;
                }
                relativePositionMatrix[13] = Math.min(Math.max(relativePositionMatrix[13], this._minimumY), this._maximumY);
            }
        }
        if (this._zIsConfined) {
            if ((relativePositionMatrix[14] < this._minimumZ) || (relativePositionMatrix[14] > this._maximumZ)) {
                if (this._resetsWhenLeavingConfines) {
                    this.resetToDefaults();
                    return false;
                }
                relativePositionMatrix[14] = Math.min(Math.max(relativePositionMatrix[14], this._minimumZ), this._maximumZ);
            }
        }
        // if the position is only taken as relative at the start, then calculate and store the world position
        if (this._startsWithRelativePosition && (!this._isStarting) && (this._followedObjects.length > 0)) {
            this._relativePositionMatrix = mat.translatedByM4(
                    mat.translation4m4(mat.prodTranslationRotation4(
                            relativePositionMatrix,
                            this.getFollowedObjectOrientationMatrix())),
                    this.getFollowedPositionMatrix());
        } else {
            this._relativePositionMatrix = relativePositionMatrix;
        }
        return true;
    };
    /**
     * Updates the position of the configuration based on the movement of the camera and the objects it follows
     * @param {Float32Array} worldOrientationMatrix The orientation of the camera in world coordinates - a free camera moves along its own
     * axes
     * @param {Number[3]} [orientationFollowedObjectsPositionVector] The position vector of the object(s) followed by orientation.
     * If there is no object followed by position, then distance confines will be applied to the object(s) followed by orientation (if any)
     * @param {Number[3]} velocityVector The vector describing the current velocity of the camera (not taking into account the movement
     * of the objects it follows and the orientation, as those are calculated in within this functions)
     * This method might update the velocity vector.
     * @param {Number} dt The time passed since the last update, to calculate the distance travelled
     * @returns {Boolean} Whether the update has been successfully completed (or a reset has been happened instead)
     */
    CameraPositionConfiguration.prototype.update = function (worldOrientationMatrix, orientationFollowedObjectsPositionVector, velocityVector, dt) {
        var translationVector, distance;
        if (!this._fixed) {
            if ((this._followedObjects.length === 0) || this._startsWithRelativePosition) {
                translationVector = vec.scaled3(vec.mulVec3Mat4(velocityVector, worldOrientationMatrix), dt / 1000);
                mat.translateByVector(this._relativePositionMatrix, translationVector);
            } else {
                if (this._turnsAroundObjects) {
                    if (this._distanceIsConfined) {
                        translationVector = mat.translationVector3(this._relativePositionMatrix);
                        distance = vec.length3(translationVector) + (velocityVector[2] * dt / 1000);
                        if ((distance < this._minimumDistance) || (distance > this._maximumDistance)) {
                            if (this._resetsWhenLeavingConfines) {
                                this.resetToDefaults();
                                return false;
                            }
                            velocityVector[2] = 0;
                            distance = Math.min(Math.max(distance, this._minimumDistance), this._maximumDistance);
                        }
                        this._relativePositionMatrix = mat.translation4v(vec.scaled3(vec.normal3(translationVector), distance));
                    }
                } else {
                    if (this._movesRelativeToObject) {
                        mat.translateByVector(this._relativePositionMatrix, vec.scaled3(vec.mulVec3Mat4(velocityVector, mat.rotation4([1, 0, 0], -Math.PI / 2)), dt / 1000));
                    } else {
                        mat.translateByVector(this._relativePositionMatrix, vec.scaled3(vec.mulVec3Mat4(
                                velocityVector,
                                mat.prod3x3SubOf4(
                                        worldOrientationMatrix,
                                        mat.inverseOfRotation4(this.getFollowedObjectOrientationMatrix()))), dt / 1000));
                    }
                }
            }
        }
        if (!this._isTransitionConfiguration) {
            if (!this._checkConfines(orientationFollowedObjectsPositionVector)) {
                return false;
            }
            this._cleanupFollowedObjects();
        }
        this._worldPositionMatrix = null;
        return true;
    };
    // #########################################################################
    /**
     * @class This class can update and compute the orientation of a camera in world coordinates, based on the related configuration 
     * settings, which it stores.
     * @param {Boolean} fixed Whether the camera orientation should be locked and not be turnable by the user
     * @param {Boolean} pointsTowardsObjects Whether the camera orientation should be calculated so that it always faces the followed objects
     * @param {Boolean} fps Whether the camera should work in "FPS-mode", by being turnable along 2 axes (of a base coordinate system, that
     * can be specified at the time of calculation)
     * @param {Object3D[]} followedObjects The list of objects the camera's orientation should follow. Setting no objects means the set 
     * orientation is absolute, setting multiple objects means the orientation of the first one will be followed. (as of now, can be changed
     * later to utilize all orientations)
     * @param {Float32Array} orientationMatrix The starting relative (if objects are followed) or world (if not) orientation of the camera.
     * @param {Number} [alpha=0] In FPS-mode, the starting alpha angle (around the Z axis)
     * @param {Number} [beta=0] In FPS-mode, the starting beta angle (around X axis)
     * @param {Number[2]} [alphaRange=[DEFAULT_MIN_ALPHA, DEFAULT_MAX_ALPHA]] In FPS-mode, the lowest and highest possible values for the alpha angle.
     * @param {Number[2]} [betaRange=[DEFAULT_MIN_BETA, DEFAULT_MAX_BETA]] In FPS-mode, the lowest and highest possible values for the beta angle.
     * @param {String} [baseOrientation] (enum CameraOrientationConfiguration.prototype.BaseOrientation) What coordinate system should be 
     * taken as base when calculating the orientation in FPS-mode.
     * @param {String} [pointToFallback] (enum CameraOrientationConfiguration.prototype.PointToFallback) In point-to mode, what orientation 
     * calculation to use if no objects are specified to point towards to
     * @param {Boolean} [isTransitionConfiguration=false] If true, the configuration will serve as a suitable starting point for 
     * transitions, as it will not perform major updates (resets, changes) and the checks necessary for them (object cleanup and fallback). 
     * Such a copy can be made from a configuration and then use it to transition to the regular configuration which gets properly updated 
     * to provide a smooth transition between the non-updated and updated state
     */
    function CameraOrientationConfiguration(fixed, pointsTowardsObjects, fps, followedObjects, orientationMatrix, alpha, beta, alphaRange, betaRange, baseOrientation, pointToFallback, isTransitionConfiguration) {
        /**
         * If true, the camera orientation can't be controlled by the player, but is automatically
         * calculated. The absolute orientation might still change e.g. if it is relative to objects
         * in the scene.
         * @type Boolean
         */
        this._fixed = fixed;
        /**
         * If objects are followed, the true value means the orientation needs to be calculated so
         * that the camera faces the followed point, while false means that the orientation is to
         * be set to the same as (the first of) the followed objects, and the transformation described
         * in this configuration is applied subsequently.
         * @type Boolean
         */
        this._pointsTowardsObjects = pointsTowardsObjects;
        /**
         * "FPS camera mode": True means that rather than applying the matrix transformation stored
         * in the orientation matrix, the orientation is calculated by applying two rotations relative
         * to the axes of the (average) orientation of followed objects, or the world, if no objects
         * are followed. The two degrees of the rotations are stored in alpha and beta.
         * @type Boolean
         */
        this._fps = fps;
        /**
         * The list of objects the camera orientation is following. If empty, the camera is free to 
         * turn around or has a constant absolute orientation if fixed. If more than one object is in the 
         * list, the camera orientation is relative to the average orientatio of the objects (or points
         * towards their average position).
         * @type Object3D[]
         */
        this._followedObjects = followedObjects || [];
        /**
         * Stores a copy of the starting relative orientation matrix so it can be reset to it later.
         * @type Float32Array
         */
        this._defaultRelativeOrientationMatrix = mat.matrix4(orientationMatrix);
        /**
         * If FPS mode is off, this matrix describes the orientation stored in this configuration. Not the same 
         * as the world orientation of the camera itself, as it can be relative to followed objects. (or their position)
         * @type Float32Array
         */
        this._relativeOrientationMatrix = orientationMatrix;
        /**
         * Describes the orientation of the camera in the world. This is calculated based on the other
         * properties and cannot be set directly.
         * @type Float32Array
         */
        this._worldOrientationMatrix = null;
        /**
         * Stores a copy of the starting alpha angle so it can be reset to it later.
         * @type Number
         */
        this._defaultAlpha = alpha || 0;
        /**
         * If FPS mode is on, this number describes the angle by which the orientation needs to be rotated around the
         * Y axis, in degrees.
         * @type Number
         */
        this._alpha = alpha || 0;
        /**
         * Stores a copy of the starting beta angle so it can be reset to it later.
         * @type Number
         */
        this._defaultBeta = beta || 0;
        /**
         * If FPS mode is on, this number describes the angle by which the orientation needs to be rotated around the
         * X axis, in degrees.
         * @type Number
         */
        this._beta = beta || 0;
        /**
         * If the camera is in FPS mode and not fixed, this value constraints turning it around, as the alpha angle
         * cannot be set below it. Can be a negative number. In degrees.
         * @type Number
         */
        this._minAlpha = (alphaRange && (alphaRange[0] !== undefined)) ? alphaRange[0] : DEFAULT_MIN_ALPHA;
        /**
         * If the camera is in FPS mode and not fixed, this value constraints turning it around, as the alpha angle
         * cannot be set above it. In degrees.
         * @type Number
         */
        this._maxAlpha = (alphaRange && (alphaRange[1] !== undefined)) ? alphaRange[1] : DEFAULT_MAX_ALPHA;
        /**
         * See min alpha for explanation. The minimum for the beta angle. In degrees.
         * @type Number
         */
        this._minBeta = (betaRange && (betaRange[0] !== undefined)) ? betaRange[0] : DEFAULT_MIN_BETA;
        /**
         * See max alpha for explanation. The maximum for the beta angle. In degrees.
         * @type Number
         */
        this._maxBeta = (betaRange && (betaRange[1] !== undefined)) ? betaRange[1] : DEFAULT_MAX_BETA;
        /**
         * (enum CameraOrientationConfiguration.prototype.BaseOrientation) What coordinate system should be taken as base when calculating 
         * the orientation in FPS-mode.
         * @type String
         */
        this._baseOrientation = baseOrientation;
        /**
         * (enum CameraOrientationConfiguration.prototype.PointToFallback) In point-to mode, what orientation calculation to use if no 
         * objects are specified to point towards to
         * @type String
         */
        this._pointToFallback = pointToFallback;
        /**
         * If true, the configuration serves as a suitable starting point for transitions, as it will not perform major updates (resets, 
         * changes) and the checks necessary for them (object cleanup, fallback). 
         */
        this._isTransitionConfiguration = isTransitionConfiguration;
        /**
         * A reference to the camera that currently uses this orientation configuration
         * @type Camera
         */
        this._camera = null;
    }
    /**
     * @enum {String}
     * Options about what coordinate sytem should be taken as base when calculating the orientation in FPS-mode.
     */
    CameraOrientationConfiguration.prototype.BaseOrientation = {
        /**
         * The FPS-mode angles should be relative to the world coordinate system
         */
        WORLD: "world",
        /**
         * The FPS-mode angles should be relative to the orientation of the object(s) followed by position
         */
        POSITION_FOLLOWED_OBJECTS: "positionFollowedObjects",
        /**
         * The FPS-mode angles should be relative to the orientation of the (first) object followed by orientation
         */
        ORIENTATION_FOLLOWED_OBJECT: "orientationFollowedObject"
    };
    Object.freeze(CameraOrientationConfiguration.prototype.BaseOrientation);
    /**
     * @enum {String}
     * Options on what orientation calculation to fall back to in case a "point-to" configuration was set (which always faces the followed
     * objects), but no followed objects are specified.
     */
    CameraOrientationConfiguration.prototype.PointToFallback = {
        /**
         * Treat the relative orientation matrix as world orientation matrix
         */
        WORLD: "world",
        /**
         * Let the orientation stay as it is (as it was before)
         */
        STATIONARY: "stationary",
        /**
         * Calculate the orientation relative to the object that is followed by position. If no object is followed by position, use the
         * world setting
         */
        POSITION_FOLLOWED_OBJECT_OR_WORLD: "positionFollowedObjectOrWorld"
    };
    Object.freeze(CameraOrientationConfiguration.prototype.PointToFallback);
    /**
     * Returns a camera orientation configuration with the same settings as this one, cloning referenced values to make sure changes to this
     * configuration do not affect the created copy.
     * @param {Boolean} [transitionCopy=false] Create a copy that serves as a transition configuration (not doing object cleanup, fallback
     * checking, only regular following of orientation)
     * @returns {CameraOrientationConfiguration}
     */
    CameraOrientationConfiguration.prototype.copy = function (transitionCopy) {
        var result = new CameraOrientationConfiguration(
                this._fixed,
                this._pointsTowardsObjects,
                this._fps,
                this._followedObjects.slice(),
                mat.matrix4(this._defaultRelativeOrientationMatrix),
                this._alpha,
                this._beta,
                [this._minAlpha, this._maxAlpha],
                [this._minBeta, this._maxBeta],
                this._baseOrientation,
                this._pointToFallback,
                transitionCopy);
        result._relativeOrientationMatrix = mat.matrix4(this._relativeOrientationMatrix);
        result._worldOrientationMatrix = mat.matrix4(this._worldOrientationMatrix);
        return result;
    };
    /**
     * Sets the reference to the camera currently using this orientation configuration
     * @param {Camera} value
     */
    CameraOrientationConfiguration.prototype.setCamera = function (value) {
        this._camera = value;
    };
    /**
     * Resets the configuration to its initial state.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraOrientationConfiguration.prototype.resetToDefaults = function (doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.orientationConfigurationWillChange();
        }
        mat.setMatrix4(this._relativeOrientationMatrix, this._defaultRelativeOrientationMatrix);
        this._alpha = this._defaultAlpha;
        this._beta = this._defaultBeta;
        this._worldOrientationMatrix = null;
    };
    /**
     * Directly sets a new relative orientation matrix for this configuration.
     * @param {Float32Array} value A 4x4 rotation matrix.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraOrientationConfiguration.prototype.setRelativeOrientationMatrix = function (value, doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.orientationConfigurationWillChange();
        }
        this._relativeOrientationMatrix = value;
    };
    /**
     * Returns whether this configuration is in FPS-mode.
     * @returns {Boolean}
     */
    CameraOrientationConfiguration.prototype.isFPS = function () {
        return this._fps;
    };
    /**
     * If no parameter is given, returns whether the configuration is set to follow any objects. If a list of objects is given, returns 
     * whether this conifugation is set to follow the same list of objects.
     * @param {Object3D[]} [objects]
     * @returns {Boolean}
     */
    CameraOrientationConfiguration.prototype.followsObjects = function (objects) {
        return objects ?
                utils.arraysEqual(this._followedObjects.sort(), objects.sort()) :
                (this._followedObjects.length > 0);
    };
    /**
     * Sets the list of followed object to the passed one.
     * @param {Object3D[]} followedObjects
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraOrientationConfiguration.prototype.setFollowedObjects = function (followedObjects, doNotNotifyCamera) {
        if ((this._followedObjects.length === 0) && (followedObjects.length === 0)) {
            return;
        }
        if (this._camera && !doNotNotifyCamera) {
            this._camera.orientationConfigurationWillChange();
        }
        this._followedObjects = followedObjects;
    };
    /**
     * Sets the list of followed object to the single passed 3D object.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     * @param {Object3D} followedObject
     */
    CameraOrientationConfiguration.prototype.setFollowedObject = function (followedObject, doNotNotifyCamera) {
        if ((this._followedObjects.length === 1) && (this._followedObjects[0] === followedObject)) {
            return;
        }
        this.setFollowedObjects([followedObject], doNotNotifyCamera);
    };
    /**
     * Returns a 3D vector describing the current (average) location in space of the followed objects.
     * @returns {Number[3]}
     */
    CameraOrientationConfiguration.prototype.getFollowedObjectsPositionVector = function () {
        var i, positionVector = [0, 0, 0];
        if (this._followedObjects.length === 0) {
            application.crash();
        } else {
            for (i = 0; i < this._followedObjects.length; i++) {
                vec.add3(positionVector, this._followedObjects[i].getPositionVector());
            }
            positionVector = [
                positionVector[0] / this._followedObjects.length,
                positionVector[1] / this._followedObjects.length,
                positionVector[2] / this._followedObjects.length
            ];
        }
        return positionVector;
    };
    /**
     * Returns the orientation matrix of the first followed object. Can be later changed to calculate an orientation based on all objects
     * in the list.
     * @returns {Float32Array}
     */
    CameraOrientationConfiguration.prototype.getFollowedOrientationMatrix = function () {
        var orientation;
        if (this._followedObjects.length === 0) {
            application.crash();
        } else {
            orientation = mat.matrix4(this._followedObjects[0].getOrientationMatrix());
        }
        return orientation;
    };
    /**
     * Removes the destroyed objects from the list of followed objects.
     * @returns {Boolean} Whether the cleanup finished in order (true) or there was a change in the settings (false)
     */
    CameraOrientationConfiguration.prototype._cleanupFollowedObjects = function () {
        var i, j, k;
        for (i = 0; i < this._followedObjects.length; i++) {
            j = i;
            k = 0;
            while ((j < this._followedObjects.length) && ((!this._followedObjects[j]) || (this._followedObjects[j].canBeReused() === true))) {
                j++;
                k++;
            }
            if (k > 0) {
                // if all followed objects have been eliminated, adapt
                if (this._followedObjects.length === k) {
                    // notify the camera before any changes are made to the configuration, so it can make a copy of the original settings
                    if (this._camera) {
                        this._camera.orientationConfigurationWillChange();
                    }
                    // point-to modes have an explicitly set fallback option, but for other modes switch to absolute orientation
                    if (!this._pointsTowardsObjects) {
                        mat.setMatrix4(this._relativeOrientationMatrix, this._worldOrientationMatrix || this._relativeOrientationMatrix || this._defaultRelativeOrientationMatrix);
                        this._fps = false;
                    }
                    this._followedObjects.splice(i, k);
                    return false;
                }
                this._followedObjects.splice(i, k);
            }
        }
        return true;
    };
    /**
     * Calculates and updates the internally stored world orientation matrix (which is nulled out automatically whenever one of the values it 
     * depends on changes, therefore serving as a cache variable)
     * @param {Float32Array} worldPositionMatrix The current position of the camera in world coordinates - needed for configurations
     * that always face the followed object, so that the orientation can be set according to the direction from the camera towards the objects
     * @param {Float32Array} positionFollowedObjectOrientationMatrix The orientation matrix of the object(s) that are followed by position
     * (by the camera that uses this orientation configuration) Needed as in FPS-mode, this can be taken as a base coordinate system, and
     * in point-to mode, as a fallback base orientation
     */
    CameraOrientationConfiguration.prototype._calculateWorldOrientationMatrix = function (worldPositionMatrix, positionFollowedObjectOrientationMatrix) {
        var baseOrientationMatrix, dirTowardsObject, axis,
                calculateRelative = function (followedOrientationMatrix) {
                    // look in direction y instead of z:
                    this._worldOrientationMatrix = mat.prod3x3SubOf4(
                            mat.prod3x3SubOf4(
                                    mat.rotation4([1, 0, 0], -Math.PI / 2),
                                    this._relativeOrientationMatrix),
                            followedOrientationMatrix);
                }.bind(this),
                calculateAbsolute = function () {
                    if (this._fps) {
                        this._worldOrientationMatrix = mat.prod3x3SubOf4(mat.rotation4([1, 0, 0], -Math.PI / 2), this._relativeOrientationMatrix);
                    } else {
                        this._worldOrientationMatrix = mat.matrix4(this._relativeOrientationMatrix);
                    }
                }.bind(this);
        if (this._followedObjects.length > 0) {
            if (!this._pointsTowardsObjects) {
                calculateRelative(this.getFollowedOrientationMatrix());
            } else {
                if (!worldPositionMatrix) {
                    application.crash();
                } else {
                    dirTowardsObject = vec.normal3(vec.diff3(this.getFollowedObjectsPositionVector(), mat.translationVector3(worldPositionMatrix)));
                    if (!this._fps) {
                        if (!this._worldOrientationMatrix) {
                            this._worldOrientationMatrix = mat.identity4();
                        }
                        this._worldOrientationMatrix[8] = dirTowardsObject[0];
                        this._worldOrientationMatrix[9] = dirTowardsObject[1];
                        this._worldOrientationMatrix[10] = dirTowardsObject[2];
                        axis = vec.cross3([1, 0, 0], dirTowardsObject);
                        this._worldOrientationMatrix[4] = axis[0];
                        this._worldOrientationMatrix[5] = axis[1];
                        this._worldOrientationMatrix[6] = axis[2];
                        axis = vec.cross3(dirTowardsObject, axis);
                        this._worldOrientationMatrix[0] = axis[0];
                        this._worldOrientationMatrix[1] = axis[1];
                        this._worldOrientationMatrix[2] = axis[2];
                        this._worldOrientationMatrix = mat.correctedOrthogonal4(this._worldOrientationMatrix);
                    } else {
                        switch (this._baseOrientation) {
                            case this.BaseOrientation.WORLD:
                                baseOrientationMatrix = null;
                                break;
                            case this.BaseOrientation.POSITION_FOLLOWED_OBJECTS:
                                baseOrientationMatrix = positionFollowedObjectOrientationMatrix || null;
                                break;
                            case this.BaseOrientation.ORIENTATION_FOLLOWED_OBJECT:
                                baseOrientationMatrix = this.followsObjects() ? this.getFollowedOrientationMatrix() : null;
                                break;
                            default:
                                application.crash();
                        }
                        if (baseOrientationMatrix) {
                            dirTowardsObject = vec.mulVec3Mat4(dirTowardsObject, mat.inverseOfRotation4(baseOrientationMatrix));
                        } else {
                            baseOrientationMatrix = mat.IDENTITY4;
                        }
                        this._alpha = vec.angle2uCapped([0, 1], vec.normal2([dirTowardsObject[0], dirTowardsObject[1]]));
                        if (dirTowardsObject[0] < 0) {
                            this._alpha = -this._alpha;
                        }
                        this._worldOrientationMatrix = mat.prod3x3SubOf4(mat.rotation4([1, 0, 0], -Math.PI / 2), mat.rotation4([0, 0, 1], this._alpha));
                        this._beta = vec.angle3uCapped(mat.getRowC43Neg(this._worldOrientationMatrix), dirTowardsObject);
                        if (dirTowardsObject[2] > 0) {
                            this._beta = -this._beta;
                        }
                        this._worldOrientationMatrix = mat.prod3x3SubOf4(
                                mat.prod3x3SubOf4(
                                        mat.rotation4([1, 0, 0], -Math.PI / 2),
                                        mat.rotation4([1, 0, 0], this._beta)),
                                mat.rotation4([0, 0, 1], this._alpha));
                        mat.mul4(this._worldOrientationMatrix, baseOrientationMatrix);
                    }
                }
            }
        } else {
            if (this._pointsTowardsObjects) {
                switch (this._pointToFallback) {
                    case this.PointToFallback.WORLD:
                        calculateAbsolute();
                        break;
                    case this.PointToFallback.STATIONARY:
                        if (!this._worldOrientationMatrix) {
                            this._worldOrientationMatrix = mat.identity4();
                        }
                        break;
                    case this.PointToFallback.POSITION_FOLLOWED_OBJECT_OR_WORLD:
                        if (positionFollowedObjectOrientationMatrix) {
                            calculateRelative(positionFollowedObjectOrientationMatrix);
                        } else {
                            calculateAbsolute();
                        }
                        break;
                    default:
                        application.crash();
                }
            } else {
                calculateAbsolute();
            }
        }
    };
    /**
     * If not cached, calculates, and returns the rotation matrix describing the current orientation of the camera in world coordinates.
     * @param {Float32Array} worldPositionMatrix The current position of the camera in world coordinates - needed for configurations
     * that always face the followed object, so that the orientation can be set according to the direction from the camera towards the objects
     * @param {Float32Array} positionFollowedObjectOrientationMatrix The orientation matrix of the object(s) that are followed by position
     * (by the camera that uses this orientation configuration) Needed as in FPS-mode, this can be taken as a base coordinate system, and
     * in point-to mode, as a fallback base orientation
     * @returns {Float32Array}
     */
    CameraOrientationConfiguration.prototype.getWorldOrientationMatrix = function (worldPositionMatrix, positionFollowedObjectOrientationMatrix) {
        if (!this._worldOrientationMatrix) {
            this._calculateWorldOrientationMatrix(worldPositionMatrix, positionFollowedObjectOrientationMatrix);
        }
        return this._worldOrientationMatrix;
    };
    /**
     * Updates the orientation of the configuration based on the spin of the camera and the position / orientation of the objects it follows
     * @param {Number[3]} angularVelocityVector The vector describing the current angular velocity (spin) of the camera (not taking into account the spin
     * of the objects it follows and the current orientation, as those are calculated in within this functions) degrees / second, around axes [X, Y, Z]
     * @param {Number} dt The time passed since the last update, to calculate the angles by which the camera rotated since 
     * @returns {Boolean} Whether the update finished successfully (true) or there was a change in the settings (false)
     */
    CameraOrientationConfiguration.prototype.update = function (angularVelocityVector, dt) {
        if (this._pointsTowardsObjects && !this.followsObjects() && (this._pointToFallback === this.PointToFallback.STATIONARY)) {
            return;
        }
        if (!this._fixed) {
            if (this._fps) {
                this._alpha += angularVelocityVector[1] * dt / 1000;
                this._beta += angularVelocityVector[0] * dt / 1000;
                if (this._alpha >= 360) {
                    this._alpha -= 360;
                }
                if (this._alpha <= -360) {
                    this._alpha += 360;
                }
                if (this._beta >= 360) {
                    this._beta -= 360;
                }
                if (this._beta <= -360) {
                    this._beta += 360;
                }
                this._alpha = Math.min(Math.max(this._minAlpha, this._alpha), this._maxAlpha);
                this._beta = Math.min(Math.max(this._minBeta, this._beta), this._maxBeta);
                this._relativeOrientationMatrix = mat.prod3x3SubOf4(mat.rotation4([1, 0, 0], this._beta * Math.PI / 180), mat.rotation4([0, 0, 1], this._alpha * Math.PI / 180));
            } else {
                if (this._followedObjects.length > 0) {
                    mat.mul4(this._relativeOrientationMatrix, mat.prod34(
                            mat.rotation4(vec.normal3(mat.getRowB43(this._relativeOrientationMatrix)), angularVelocityVector[2] * Math.PI / 180 * dt / 1000),
                            mat.rotation4(vec.normal3(mat.getRowA43(this._relativeOrientationMatrix)), angularVelocityVector[0] * Math.PI / 180 * dt / 1000),
                            mat.rotation4(vec.normal3(mat.getRowC43(this._relativeOrientationMatrix)), angularVelocityVector[1] * Math.PI / 180 * dt / 1000)));
                } else {
                    mat.mul4(this._relativeOrientationMatrix, mat.prod34(
                            mat.rotation4(vec.normal3(mat.getRowC43(this._relativeOrientationMatrix)), angularVelocityVector[2] * Math.PI / 180 * dt / 1000),
                            mat.rotation4(vec.normal3(mat.getRowA43(this._relativeOrientationMatrix)), angularVelocityVector[0] * Math.PI / 180 * dt / 1000),
                            mat.rotation4(vec.normal3(mat.getRowB43(this._relativeOrientationMatrix)), angularVelocityVector[1] * Math.PI / 180 * dt / 1000)));
                }
            }
        }
        if (!this._isTransitionConfiguration) {
            if (!this._cleanupFollowedObjects()) {
                return false;
            }
        }
        this._worldOrientationMatrix = null;
        return true;
    };
    // #########################################################################
    /**
     * @class Stores a specific configuration of camera settings such as how the position and orientation should be calculated (in two 
     * separate contained objects) or what is the current, maximum, minimum field of view. Based on the information stored in this 
     * object, the state of the camera at one point in time can be calculated. This class therefore only stores information about a static 
     * state and the constraints it has. The actual camera object can store two of these configurations and transition its state between 
     * them and stores all the dynamic information such as velocity.
     * @extends Object3D
     * @param {String} [name] An optional, descriptive name of this configuration by which it can be found and referred to later.
     * @param {CameraPositionConfiguration} positionConfiguration All the settings necessary to calculate the world position.
     * @param {CameraOrientationConfiguration} orientationConfiguration All the settings necessary to calculate the world orientation.
     * @param {Number} fov The starting field of view, in degrees.
     * @param {Number} fovRange The minimum and maximum field of view value that can be set for a camera using this configuration.
     * @param {Number} span The starting span of the camera. This is the world-space distance that the camera sees
     * horizontally or vertically at depth 0, depending on camera setting. The other value will be calculated basen on the aspect of the 
     * camera. In meters.
     * @param {Number} spanRange The minimum and maximum span that can be set for a camera using this configuration.
     * @param {Boolean} resetsOnFocusChange An indicator whether this configuration should automatically reset to default state when the camera 
     * switches to it or when the camera controls go out of focus (after being in focus)
     */
    function CameraConfiguration(name, positionConfiguration, orientationConfiguration, fov, fovRange, span, spanRange, resetsOnFocusChange) {
        object3D.Object3D.call(this, positionConfiguration._positionMatrix, orientationConfiguration._orientationMatrix);
        /**
         * An optional, descriptive name of this configuration by which it can be found and referred to.
         * @type String
         */
        this._name = name;
        /**
         * Stores all the settings necessary to calculate the world position and can carry out the calculations as well.
         * @type CameraPositionConfiguration
         */
        this._positionConfiguration = positionConfiguration;
        /**
         * Stores all the settings necessary to calculate the world orientation and can carry out the calculations as well.
         * @type CameraOrientationConfiguration
         */
        this._orientationConfiguration = orientationConfiguration;
        /**
         * The starting field of view, in degrees is stored so the configuration can be reset to defaults later.
         * @type Number
         */
        this._defaultFOV = fov;
        /**
         * The current field of view, in degrees. Refers to the field of view, the vertical will depend on the aspect of the camera.
         * @type Number
         */
        this._fov = fov;
        /**
         * The minimum value to which the field of view can be set in this configuration, in degrees.
         * @type Number
         */
        this._minFOV = fovRange ? fovRange[0] : 0;
        /**
         * The maximum value to which the field of view can be set in this configuration, in degrees.
         * @type Number
         */
        this._maxFOV = fovRange ? fovRange[1] : 0;
        /**
         * The starting span, in meters is stored so the configuration can be reset to defaults later.
         * @type Number
         */
        this._defaultSpan = span;
        /**
         * The current span, in meters. This is the world-space distance that the camera sees
         * horizontally or vertically at depth 0, depending on camera setting. The other value
         * will be calculated basen on the aspect of the camera.
         * @type Number
         */
        this._span = span;
        /**
         * The minimum value to which the span can be set in this configuration, in meters.
         * @type Number
         */
        this._minSpan = spanRange ? spanRange[0] : 0;
        /**
         * The maximum value to which the span can be set in this configuration, in meters.
         * @type Number
         */
        this._maxSpan = spanRange ? spanRange[1] : 0;
        /**
         * An indicator whether this configuration should automatically reset to default state when the camera switches to it or when the 
         * camera controls go out of focus (after being in focus)
         * @type Boolean
         */
        this._resetsOnFocusChange = resetsOnFocusChange;
        /**
         * A reference to the camera that currently uses this configuration
         * @type Camera
         */
        this._camera = null;
    }
    object3D.makeObject3DMixinClass.call(CameraConfiguration);
    /**
     * Creates and returns copy with the same configuration settings as this one, but with new references to avoid any change made to the
     * original configuration to affect the new one or vice versa.
     * @param {String} [name=""] An optional name for the created copy.
     * @param {Boolean} [transitionCopy=false] Create a copy that serves as a transition configuration (not doing object cleanup, confine
     * checks, fallback, only regular following of position and orientation)
     * @returns {CameraConfiguration}
     */
    CameraConfiguration.prototype.copy = function (name, transitionCopy) {
        var result = new CameraConfiguration(
                name || "",
                this._positionConfiguration.copy(transitionCopy),
                this._orientationConfiguration.copy(transitionCopy),
                this._fov,
                [this._minFOV, this._maxFOV],
                this._span,
                [this._minSpan, this._maxSpan]);
        result.setPositionMatrix(mat.matrix4(this.getPositionMatrix()));
        result.setOrientationMatrix(mat.matrix4(this.getOrientationMatrix()));
        return result;
    };
    /**
     * Sets the reference to the camera currently using this configuration
     * @param {Camera} value
     * @param {Boolean} [doNotReset=false] If true, the automatic configuration reset will be suppressed 
     */
    CameraConfiguration.prototype.setCamera = function (value, doNotReset) {
        this._camera = value;
        this._positionConfiguration.setCamera(value, doNotReset);
        this._orientationConfiguration.setCamera(value);
        if (this._camera && this._resetsOnFocusChange && !doNotReset) {
            this.resetToDefaults(true);
        }
    };
    /**
     * Sets a new relative (or absolute, depending on the configuration properties) position matrix for this configuration.
     * @param {Float32Array} value A 4x4 translation matrix.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.setRelativePositionMatrix = function (value, doNotNotifyCamera) {
        this._positionConfiguration.setRelativePositionMatrix(value, doNotNotifyCamera);
    };
    /**
     * Moves the relative (or absolute, depending on the configuration properties) position of the configuration by the passed 3D vector.
     * @param {Number[3]} vector
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.moveByVector = function (vector, doNotNotifyCamera) {
        this._positionConfiguration.moveByVector(vector, doNotNotifyCamera);
    };
    /**
     * Sets a new relative (or absolute, depending on the configuration properties) orientation matrix for this configuration.
     * @param {Float32Array} value A 4x4 rotation matrix.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.setRelativeOrientationMatrix = function (value, doNotNotifyCamera) {
        this._orientationConfiguration.setRelativeOrientationMatrix(value, doNotNotifyCamera);
    };
    /**
     * Returns the descriptive name of this configuration so it can be identified.
     * @returns {String}
     */
    CameraConfiguration.prototype.getName = function () {
        return this._name;
    };
    /**
     * Returns whether this configuration is in FPS-mode.
     * @returns {Boolean}
     */
    CameraConfiguration.prototype.isFPS = function () {
        return this._orientationConfiguration.isFPS();
    };
    /**
     * Sets the configuration's field of view 
     * @param {Number} fov The new desired FOV in degrees.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.setFOV = function (fov, doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.configurationWillChange();
        }
        this._fov = Math.min(Math.max(fov, this._minFOV), this._maxFOV);
    };
    /**
     * Returns the currently set field of view, in degrees.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getFOV = function () {
        return this._fov;
    };
    /**
     * Returns the minimum field of view that can be set, in degrees.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getMinFOV = function () {
        return this._minFOV;
    };
    /**
     * Returns the maximum field of view that can be set, in degrees.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getMaxFOV = function () {
        return this._maxFOV;
    };
    /**
     * Decreases the field of view of the configuration by a small amount (but not below the set minimum).
     * @returns {Number} The resulting new value of the field of view. (in degrees)
     */
    CameraConfiguration.prototype.decreaseFOV = function () {
        this.setFOV(this._fov * FOV_DECREASE_FACTOR, true);
        return this._fov;
    };
    /**
     * Increases the field of view of the configuration by a small amount (but not above the set maximum).
     * @returns {Number} The resulting new value of the field of view. (in degrees)
     */
    CameraConfiguration.prototype.increaseFOV = function () {
        this.setFOV(this._fov * FOV_INCREASE_FACTOR, true);
        return this._fov;
    };
    /**
     * Sets the configuration's span.
     * @param {Number} span The new desired span in meters.
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.setSpan = function (span, doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.configurationWillChange();
        }
        this._span = Math.min(Math.max(span, this._minSpan), this._maxSpan);
    };
    /**
     * Returns the currently set span, in meters.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getSpan = function () {
        return this._span;
    };
    /**
     * Returns the minimum span that can be set, in meters.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getMinSpan = function () {
        return this._minSpan;
    };
    /**
     * Returns the maximum span that can be set, in meters.
     * @returns {Number}
     */
    CameraConfiguration.prototype.getMaxSpan = function () {
        return this._maxSpan;
    };
    /**
     * Decreases the span of the configuration by a small amount (but not below the set minimum).
     * @returns {Number} The resulting new value of the span. (in meters)
     */
    CameraConfiguration.prototype.decreaseSpan = function () {
        this.setSpan(this._span * SPAN_DECREASE_FACTOR, true);
        return this._span;
    };
    /**
     * Increases the span of the configuration by a small amount (but not above the set maximum).
     * @returns {Number} The resulting new value of the span. (in meters)
     */
    CameraConfiguration.prototype.increaseSpan = function () {
        this.setSpan(this._span * SPAN_INCREASE_FACTOR, true);
        return this._span;
    };
    /**
     * Returns whether this configuration should automatically reset to default state when the camera switches to it or when the camera 
     * controls go out of focus (after being in focus)
     * @returns {Boolean}
     */
    CameraConfiguration.prototype.resetsOnFocusChange = function () {
        return this._resetsOnFocusChange;
    };
    /**
     * Resets all configuration values to their initial state (including position, orientation, field of view and span configuration)
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.resetToDefaults = function (doNotNotifyCamera) {
        if (this._camera && !doNotNotifyCamera) {
            this._camera.configurationWillChange();
        }
        this.setFOV(this._defaultFOV, true);
        this.setSpan(this._defaultSpan, true);
        this._positionConfiguration.resetToDefaults(true);
        this._orientationConfiguration.resetToDefaults(true);
    };
    /**
     * Updates the position and orientation of the camera based on the current configuration values and the given velocity and spin vectors.
     * The passed vectors should represent a velocity set by the user who is controlling the camera, and how they are interpreted in world 
     * coordinates depends on the actual configuration settings (such as a fixed position camera will ignore the velocityVector, a free
     * position configuration will move the camera along its own axes etc). The update might change the position or the orientation of the
     * camera even if the passed vectors are null vectors, the camera can be set to follow moving objects in the scene!
     * @param {Number[3]} velocityVector The velocity of the camera set by the controlling user: [X,Y,Z] (not in world coordinates)
     * @param {Number[3]} angularVelocityVector The spin of the camera set by the controlling user, around axes: [X,Y,Z], degrees / second
     * @param {Number} dt The passed time since the last update, to calculate the actual path travelled / angles rotated since then
     * @returns {Boolean} Whether the update has been successfully completed (or a change has happened during it)
     */
    CameraConfiguration.prototype.update = function (velocityVector, angularVelocityVector, dt) {
        var result = true;
        result = this._orientationConfiguration.update(angularVelocityVector, dt);
        this.setOrientationMatrix(this._orientationConfiguration.getWorldOrientationMatrix(this.getPositionMatrix(), this._positionConfiguration.followsObjects() ? this._positionConfiguration.getFollowedObjectOrientationMatrix() : null));
        result = this._positionConfiguration.update(this.getOrientationMatrix(), this._orientationConfiguration.followsObjects() ? this._orientationConfiguration.getFollowedObjectsPositionVector() : null, velocityVector, dt) && result;
        this.setPositionMatrix(this._positionConfiguration.getWorldPositionMatrix(this.getOrientationMatrix()));
        return result;
    };
    /**
     * Returns whether the camera position is set to follow any objects in this configuration.
     * @returns {Boolean}
     */
    CameraConfiguration.prototype.positionFollowsObjects = function () {
        return this._positionConfiguration.followsObjects();
    };
    /**
     * Returns whether the camera orientation is set to follow any objects in this configuration.
     * @returns {Boolean}
     */
    CameraConfiguration.prototype.orientationFollowsObjects = function () {
        return this._orientationConfiguration.followsObjects();
    };
    /**
     * Returns a 3D vector that represents the current position in the world which is being followed by this configuration.
     * The vector contains copies of the current coordinates and does not change as the followed position changes.
     * @returns {Number[3]}
     */
    CameraConfiguration.prototype.getFollowedPositionVector = function () {
        return this._positionConfiguration.getFollowedPositionVector();
    };
    /**
     * Sets the list of objects which should be followed with the orientation of the camera (either by setting a relative orientation or
     * in "point-to" mode, depending on the orientation configuration)
     * @param {Object3D[]} targetObjects Should not be null, but an empty list, if no objects are to be specified
     * @param {Boolean} [doNotNotifyCamera=false] Do not call the method of the camera using this configuration that alerts it about this change
     */
    CameraConfiguration.prototype.setOrientationFollowedObjects = function (targetObjects, doNotNotifyCamera) {
        this._orientationConfiguration.setFollowedObjects(targetObjects, doNotNotifyCamera);
    };
    /**
     * Removes all references stored by this object
     */
    CameraConfiguration.prototype.destroy = function () {
        this._positionConfiguration = null;
        this._orientationConfiguration = null;
        this._camera = null;
    };
    // -------------------------------------------------------------------------
    /**
     * Returns a new camera configuration which does not follow any objects but can be moved and turned freely and has the specified position, 
     * orientation and field of view.
     * @param {Boolean} fps Whether the orientation of the camera should be controlled in FPS mode.
     * @param {Float32Array} positionMatrix The initial position. (4x4 translation matrix)
     * @param {Float32Array} orientationMatrix The initial orientation. (4x4 rotation matrix)
     * @param {Number} fov The initial field of view, in degrees.
     * @param {Number} minFOV The minimum field of view that can be set for this configuration, in degrees.
     * @param {Number} maxFOV The maximum field of view that can be set for this configuration, in degrees.
     * @param {Number} span The initial span, in meters.
     * @param {Number} minSpan The minimum span that can be set for this configuration, in meters.
     * @param {Number} maxSpan The maximum span that can be set for this configuration, in meters.
     * @returns {CameraConfiguration}
     */
    function getFreeCameraConfiguration(fps, positionMatrix, orientationMatrix, fov, minFOV, maxFOV, span, minSpan, maxSpan) {
        var angles = mat.getYawAndPitch(orientationMatrix);
        return new CameraConfiguration(
                "",
                new CameraPositionConfiguration(false, false, false, [], false, mat.matrix4(positionMatrix), null, null, false),
                new CameraOrientationConfiguration(false, false, fps, [], mat.matrix4(orientationMatrix), Math.degrees(angles.yaw), Math.degrees(angles.pitch), undefined, undefined,
                        CameraOrientationConfiguration.prototype.BaseOrientation.WORLD,
                        CameraOrientationConfiguration.prototype.PointToFallback.POSITION_FOLLOWED_OBJECT_OR_WORLD),
                fov, [minFOV, maxFOV],
                span, [minSpan, maxSpan]);
    }
    // #########################################################################
    /**
     * @class A virtual camera that can be used to render a scene from a specific viewpoint. The position, orientation and field of view
     * of the camera is calculated by separate configuration classes, and this camera class refers those classes. It also supports 
     * transitioning smoothly from one configuration to another.
     * @param {Scene} scene A reference to the scene this camera is used to render. The camera can follow objects in this scene. (with its
     * position or orientation)
     * @param {Number} aspect The ratio of the horizontal and the vertical size of the image that should be rendered with this camera.
     * @param {Boolean} usesVerticalValues Whether to consider the set FOV and span values as vertical (true) or horizontal (false)
     * @param {Number} viewDistance Objects are visible up to this distance when rendered using this camera. (in meters)
     * @param {CameraConfiguration} configuration The starting configuration of the camera. There is no default, should not be null!
     * @param {Number} [transitionDuration=0] The time the camera should take to transition from one configuration to another by default, in 
     * milliseconds.
     * @param {String} [transitionStyle=NONE] (enum Camera.prototype.TransitionStyle) The style to use for transitions by default.
     */
    function Camera(scene, aspect, usesVerticalValues, viewDistance, configuration, transitionDuration, transitionStyle) {
        /**
         * An internal 3D object representing the position and orientation of the camera.
         * @type Object3D
         */
        this._object3D = new object3D.Object3D(mat.identity4(), mat.identity4(), mat.identity4());
        /**
         * A reference to the scene this camera is used to render.
         * @type Scene
         */
        this._scene = scene;
        /**
         * The ratio of the horizontal and the vertical size of the image that should be rendered with this camera.
         * @type Number
         */
        this._aspect = aspect;
        /**
         * Whether to consider the set FOV and span values as vertical (true) or horizontal (false)
         * @type Boolean
         */
        this._usesVerticalValues = usesVerticalValues;
        /**
         * Objects are visible up to this distance when rendered using this camera. In meters.
         * @type Number
         */
        this._viewDistance = viewDistance;
        /**
         * The configuration the camera is currently transitioning from to a new one. If no transition is in progress, its value is null.
         * @type CameraConfiguration
         */
        this._previousConfiguration = null;
        /**
         * The camera configuration that is used currently to calculate the camera position, orientation and field of view. Should never be
         * null.
         * @type CameraConfiguration
         */
        this._currentConfiguration = configuration;
        this._currentConfiguration.setCamera(this);
        /**
         * (enum Camera.prototype.TransitionStyle) The style used for the current configuration transition.
         * @type String
         */
        this._transitionStyle = this.TransitionStyle.NONE;
        /**
         * (enum Camera.prototype.TransitionStyle) The style to use for transitions by default.
         * @type String
         */
        this._defaultTransitionStyle = transitionStyle || this.TransitionStyle.NONE;
        /**
         * The duration of the transition currently in progress, in milliseconds.
         * @type Number
         */
        this._transitionDuration = 0;
        /**
         * The time the camera should take to transition from one configuration to another by default (when none is specified), in 
         * milliseconds.
         * @type Number
         */
        this._defaultTransitionDuration = transitionDuration || 0;
        /**
         * The amount of time that has already passed during the current transition. The current state of properties of the camera between
         * the two configurations is calculated based on this and the transition style.
         * @type Number
         */
        this._transitionElapsedTime = 0;
        /**
         * The vector describing the current relative velocity of the camera. This can be used to draw trails for particles that visualize
         * the camera's movement. When an object is followed, the velocity is considered to be that of the object (not counting relative
         * camera movements)
         * @type Number[3]
         */
        this._velocityVector = [0, 0, 0];
        /**
         * The relative velocity vector that is the result of acceleration induced by the user controlling the camera.
         * @type Number[3]
         */
        this._controlledVelocityVector = [0, 0, 0];
        /**
         * The current relative angular velocity of the camera, around axes: [X,Y,Z], in degrees / second
         * This is the result of angular acceleration induced by the player. (followed objects not considered)
         * @type Number[3]
         */
        this._angularVelocityVector = [0, 0, 0];
        /**
         * A stored value of the previous world position of the followed object(s), so that the camera velocity can be calculated if the 
         * camera is following objects.
         * @type Number[3]
         */
        this._previousFollowedPositionVector = null;
        /**
         * The stored value of the 4x4 perspective matrix calculated from the properties of the camera. Whenever a related property is
         * changed, the value is recalculated.
         * @type Float32Array
         */
        this._projectionMatrix = null;
        /**
         * A reference to the rendereble node that the current configuration of this camera is associated with (typically because it follows 
         * the object stored at it). Thanks to this reference, the camera can cycle through the configurations associated with the same node,
         * or pick the next node from the scene to follow.
         * @type RenderableNode
         */
        this._followedNode = null;
        /**
         * A cache variable storing the calculated value of the camera matrix. This depends on the position and orientation matrices and
         * thus is reset to null when those are changed.
         * @type Float32Array
         */
        this._viewMatrix = null;
        /**
         * A cache variable storing the calculated inverse of the position matrix. It is reset to null whenever the position changes.
         * @type Float32Array
         */
        this._inversePositionMatrix = null;
        /**
         * A cache variable storing the calculated inverse of the orientation matrix. It is reset to null whenever the orientation changes.
         * @type Float32Array
         */
        this._inverseOrientationMatrix = null;
        /**
         * The cached value of the current field of view. (in degrees)
         * @type Number
         */
        this._fov = 0;
        /**
         * The cached value of the current span of the camera.
         * @type Number
         */
        this._span = 0;
        /**
         * The cached value of the distance of the near cutting plane of the camera's view frustum from the focal point.
         * @type Number
         */
        this._near = 0;
        /**
         * A cached reference to a camera with the same position, orientation and overall parameters, but with a frustum that starts from
         * the far cutting plane of this camera and extends beyond it.
         * @type Camera
         */
        this._extendedCamera = null;
        /**
         * A cached reference to a camera with the same overall parameters, but with a view frustum that combines that of this camera and
         * its extended camera.
         * @type Camera
         */
        this._combinedExtendedCamera = null;
        // update to have appropriate starting values
        this._updateFOV();
        this._updateSpan();
    }
    /**
     * @enum {Number}
     * Options about how should the combination of the two configurations be calculated when the camera is transitioning from one
     * to the another.
     */
    Camera.prototype.TransitionStyle = {
        /**
         * No valid value given, a transition with this value will result in an error. This way accidentally not setting a value
         * can be noticed. (for instantly jumping to the new configuration, use a duration of 0)
         */
        NONE: "none",
        /**
         * Use a simple linear transition from one configuration to another. The position will move, and the direction will turn
         * in a linear manner.
         */
        LINEAR: "linear",
        /**
         * Use a calculation resulting in an accelerating change in the first half, and a decelerating change during the second
         * half of the transition.
         */
        SMOOTH: "smooth"
    };
    Object.freeze(Camera.prototype.TransitionStyle);
    /**
     * Returns the view distance of the camera (the distance of the far cutting plane of the camera's view frustum from its focal point)
     * @returns {Number}
     */
    Camera.prototype.getViewDistance = function () {
        return this._viewDistance;
    };
    /**
     * Returns the distance of the near cutting plane of the camera's view frustum from its focal point
     * @returns {Number}
     */
    Camera.prototype.getNearDistance = function () {
        return this._near;
    };
    /**
     * Returns the 4x4 translation matrix describing the current position of the camera in world space.
     * @returns {Float32Array}
     */
    Camera.prototype.getCameraPositionMatrix = function () {
        return this._object3D.getPositionMatrix();
    };
    /**
     * Returns the 3D vector describing the current position of the camera in world space.
     * @returns {Number[3]}
     */
    Camera.prototype.getCameraPositionVector = function () {
        return this._object3D.getPositionVector();
    };
    /**
     * Returns the 4x4 rotation matrix describing the current orientaton of the camera in world space.
     * @returns {Float32Array}
     */
    Camera.prototype.getCameraOrientationMatrix = function () {
        return this._object3D.getOrientationMatrix();
    };
    /**
     * Sets a new position matrix for the camera. The update method calculates the position and this should not be called from outside.
     * @param {Float32Array} value
     */
    Camera.prototype._setPositionMatrix = function (value) {
        this._object3D.setPositionMatrix(value);
        this._viewMatrix = null;
        this._inversePositionMatrix = null;
    };
    /**
     * Sets a new orientation matrix for the camera. The update method calculates the orientation and this should not be called from outside.
     * @param {Float32Array} value
     */
    Camera.prototype._setOrientationMatrix = function (value) {
        this._object3D.setOrientationMatrix(value);
        this._viewMatrix = null;
        this._inverseOrientationMatrix = null;
    };
    /**
     * Rotates the current orientation around the given axis by the given angle. This directly manipulates the orientation of the camera
     * and thus should not be used from outside! Use setAngularVelocityVector() (and update()) instead!
     * @param {Number[3]} axis The 3D vector of the axis.
     * @param {Number} angle Angle in radians.
     */
    Camera.prototype._rotate = function (axis, angle) {
        this._object3D.rotate(axis, angle);
        this._setOrientationMatrix(this._object3D.getOrientationMatrix());
    };
    /**
     * Moves the camera to the specified (absolute or relative, depending on the configuration of the camera) position.
     * @param {Number[3]} positionVector
     * @param {Number} [duration] The duration of the new transition in milliseconds. If not given, the camera default will be used. If zero
     * is given, the new configuration will be applied instantly.
     * @param {String} [style] (enum Camera.prototype.TransitionStyle) The style of the new transition to use. If not given, the camera 
     * default will be used.
     */
    Camera.prototype.moveToPosition = function (positionVector, duration, style) {
        duration = (duration === undefined) ? this._defaultTransitionDuration : duration;
        if (duration > 0) {
            this.transitionToSameConfiguration(duration, style);
        }
        this._currentConfiguration.setRelativePositionMatrix(mat.translation4v(positionVector), true);
    };
    /**
     * Returns the current view matrix based on the position and orientation. This will be the inverse transformation
     * that is to be applied to objects to transform them from world space into camera space.
     * @returns {Float32Array}
     */
    Camera.prototype.getViewMatrix = function () {
        if (!this._viewMatrix) {
            this._viewMatrix = mat.prodTranslationRotation4(this.getInversePositionMatrix(), this.getInverseOrientationMatrix());
        }
        return this._viewMatrix;
    };
    /**
     * Returns the inverse of the position matrix of the camera. Uses caching to eliminate unnecessary calculations.
     * @returns {Float32Array}
     */
    Camera.prototype.getInversePositionMatrix = function () {
        if (!this._inversePositionMatrix) {
            this._inversePositionMatrix =
                    mat.inverseOfTranslation4(this._object3D.getPositionMatrix());
        }
        return this._inversePositionMatrix;
    };
    /**
     * Returns the inverse of the orientation matrix of the camera. Uses caching to eliminate unnecessary calculations.
     * @returns {Float32Array}
     */
    Camera.prototype.getInverseOrientationMatrix = function () {
        if (!this._inverseOrientationMatrix) {
            this._inverseOrientationMatrix =
                    mat.inverseOfRotation4(this._object3D.getOrientationMatrix());
        }
        return this._inverseOrientationMatrix;
    };
    /**
     * Returns the currently set configuration of the camera. If the camera is in transition between two configurations,
     * this will return the configuration it is transitioning into.
     * @returns {CameraConfiguration}
     */
    Camera.prototype.getConfiguration = function () {
        return this._currentConfiguration;
    };
    /**
     * Returns a vector representing the current relative velocity of the camera. If the camera is freely movable by the
     * user, this will be the velocity that is the result of the user controls. If the camera position is following some
     * objects, this will be the relative velocity of the followed point in space (regardless of additional camera
     * movements). While transitioning, this will be the relative velocity of the camera position as it moves from
     * the position of the first configuration towards the second.
     * This velocity vector can be used to draw trails for objects to visualise the movement of the camera.
     * @returns {Number[3]}
     */
    Camera.prototype.getVelocityVector = function () {
        return this._velocityVector;
    };
    /**
     * Returns the current projection matrix of the camera. Currently only perspective projection is supported.
     * Calculates the matrix from the current camera properties if necessary, and caches the result.
     * @returns {Float32Array}
     */
    Camera.prototype.getProjectionMatrix = function () {
        if (!this._projectionMatrix) {
            this._updateProjectionMatrix(this._currentConfiguration.getFOV(), this._currentConfiguration.getSpan());
        }
        return this._projectionMatrix;
    };
    /**
     * Updates the stored cache value of the projection matrix of the camera based on its current properties.
     * Currently only perspective projection is supported.
     * @param {Number} fov The field of view for the perspective projection, in degrees.
     * @param {Number} span The span of the viewing rectangle at depth 0, in meters.
     */
    Camera.prototype._updateProjectionMatrix = function (fov, span) {
        // update the near cutting plane
        this._near = span / 2.0 / Math.tan(Math.radians(fov) / 2);
        if (this._usesVerticalValues) {
            this._projectionMatrix = mat.perspective4(span * this._aspect / 2.0, span / 2.0, this._near, this._viewDistance);
        } else {
            this._projectionMatrix = mat.perspective4(span / 2.0, span / this._aspect / 2.0, this._near, this._viewDistance);
        }
    };
    /**
     * Returns the current width / height aspect ratio of the camera.
     * @returns {Number}
     */
    Camera.prototype.getAspect = function () {
        return this._aspect;
    };
    /**
     * Sets the camera's aspect ratio. (width / height)
     * @param {Number} aspect The new desired aspect ratio.
     */
    Camera.prototype.setAspect = function (aspect) {
        this._aspect = aspect;
        this._projectionMatrix = null;
    };
    /**
     * Returns the current field of view (the correct current value during transitions as well), in degrees
     * @returns {Number}
     */
    Camera.prototype.getFOV = function () {
        if (!this._fov) {
            this._updateFOV(this._getTransitionProgress());
        }
        return this._fov;
    };
    /**
     * Sets the camera's field of view.
     * @param {Number} fov The new desired field of view in degrees.
     * @param {Number} [duration] The duration of the new transition in milliseconds. If not given, the camera default will be used. If zero
     * is given, the new configuration will be applied instantly.
     * @param {String} [style] (enum Camera.prototype.TransitionStyle) The style of the new transition to use. If not given, the camera 
     * default will be used.
     */
    Camera.prototype.setFOV = function (fov, duration, style) {
        duration = (duration === undefined) ? this._defaultTransitionDuration : duration;
        if (duration > 0) {
            this.transitionToSameConfiguration(duration, style);
        } else {
            this._fov = fov;
        }
        this._currentConfiguration.setFOV(fov, true);
        this._projectionMatrix = null;
    };
    /**
     * Decreases the camera's field of view by a small step, but not below the minimum allowed by the current configuration.
     */
    Camera.prototype.decreaseFOV = function () {
        this._fov = this._currentConfiguration.decreaseFOV();
        this._projectionMatrix = null;
    };
    /**
     * Increases the camera's field of view by a small step, but not above the maximum allowed by the current configuration.
     */
    Camera.prototype.increaseFOV = function () {
        this._fov = this._currentConfiguration.increaseFOV();
        this._projectionMatrix = null;
    };
    /**
     * Returns the current span (the correct current value during transitions as well), in meters
     * @returns {Number}
     */
    Camera.prototype.getSpan = function () {
        if (!this._span) {
            this._updateSpan(this._getTransitionProgress());
        }
        return this._span;
    };
    /**
     * Sets the camera's span.
     * @param {Number} span The new desired span in meters.
     * @param {Number} [duration] The duration of the new transition in milliseconds. If not given, the camera default will be used. If zero
     * is given, the new configuration will be applied instantly.
     * @param {String} [style] (enum Camera.prototype.TransitionStyle) The style of the new transition to use. If not given, the camera 
     * default will be used.
     */
    Camera.prototype.setSpan = function (span, duration, style) {
        duration = (duration === undefined) ? this._defaultTransitionDuration : duration;
        if (duration > 0) {
            this.transitionToSameConfiguration(duration, style);
        } else {
            this._span = span;
        }
        this._currentConfiguration.setSpan(span, true);
        this._projectionMatrix = null;
    };
    /**
     * Decreases the camera's span by a small step, but not below the minimum allowed by the current configuration.
     */
    Camera.prototype.decreaseSpan = function () {
        this._span = this._currentConfiguration.decreaseSpan();
        this._projectionMatrix = null;
    };
    /**
     * Increases the camera's span by a small step, but not above the maximum allowed by the current configuration.
     */
    Camera.prototype.increaseSpan = function () {
        this._span = this._currentConfiguration.increaseSpan();
        this._projectionMatrix = null;
    };
    /**
     * Sets a new controlled velocity vector for the camera. Typically a camera controller would call this.
     * @param {Number[3]} value
     */
    Camera.prototype.setControlledVelocityVector = function (value) {
        this._controlledVelocityVector = value;
    };
    /**
     * Sets a new (controlled) angular velocity vector for the camera. Typically a camera controller would call this.
     * @param {Number[3]} value
     */
    Camera.prototype.setAngularVelocityVector = function (value) {
        this._angularVelocityVector = value;
    };
    /**
     * Creates and returns a camera configuration based on the one currently set for this camera, with absolute position and orientation and
     * free movement setting. The starting position and orientation will either be the passed ones (if any), or the current position / orientation
     * of the camera.
     * @param {Boolean} [fps] Whether to set the created configuration to FPS-mode. if not specified, the current configuration setting will be used.
     * @param {Float32Array} [positionMatrix] If none given, the current world position will be used.
     * @param {Float32Array} [orientationMatrix] If none given, the current world orientation will be used.
     * @returns {CameraConfiguration}
     */
    Camera.prototype._getFreeCameraConfiguration = function (fps, positionMatrix, orientationMatrix) {
        if (fps === undefined) {
            fps = this._currentConfiguration.isFPS();
        }
        positionMatrix = positionMatrix || this.getCameraPositionMatrix();
        orientationMatrix = orientationMatrix || this.getCameraOrientationMatrix();
        if (fps) {
            orientationMatrix = mat.prod3x3SubOf4(mat.rotation4([1, 0, 0], Math.PI / 2), orientationMatrix);
        }
        return getFreeCameraConfiguration(
                fps,
                positionMatrix,
                orientationMatrix,
                this.getFOV(),
                this._currentConfiguration.getMinFOV(),
                this._currentConfiguration.getMaxFOV(),
                this.getSpan(),
                this._currentConfiguration.getMinSpan(),
                this._currentConfiguration.getMaxSpan());
    };
    /**
     * Directly sets a new configuration to use for this camera. The new configuration is applied instantly, without transition.
     * @param {CameraConfiguration} configuration 
     * @param {Boolean} [doNotResetConfiguration=false] If true, the automatic configuration reset will be suppressed 
     */
    Camera.prototype.setConfiguration = function (configuration, doNotResetConfiguration) {
        if (this._currentConfiguration) {
            this._currentConfiguration.setCamera(null);
        }
        this._currentConfiguration = configuration;
        this._currentConfiguration.setCamera(this, doNotResetConfiguration);
        this._previousConfiguration = null;
    };
    /**
     * Initiates a new transition from the current configuration to the given one. If a transition already is in progress, the new 
     * transition will start from a new, free camera configuration set to the current position and orientation of the camera.
     * @param {CameraConfiguration} configuration
     * @param {Number} [duration] The duration of the new transition in milliseconds. If not given, the camera default will be used. If zero
     * is given, the new configuration will be applied instantly.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the new transition to use. If not given, the camera 
     * default will be used.
     */
    Camera.prototype.startTransitionToConfiguration = function (configuration, duration, style) {
        if (this._currentConfiguration === configuration) {
            return;
        }
        if (duration === 0) {
            this.setConfiguration(configuration);
        } else {
            if (this._previousConfiguration && this._currentConfiguration) {
                this._previousConfiguration = this._getFreeCameraConfiguration(false);
            } else {
                this._previousConfiguration = this._currentConfiguration;
            }
            if (this._currentConfiguration) {
                this._currentConfiguration.setCamera(null);
            }
            this._currentConfiguration = configuration;
            this._currentConfiguration.setCamera(this);
            this._transitionDuration = duration === undefined ? this._defaultTransitionDuration : duration;
            this._transitionElapsedTime = 0;
            this._transitionStyle = style === undefined ? this._defaultTransitionStyle : style;
        }
    };
    /**
     * Starts a transition to a free camera configuration (with absolute position and orientation both controllable) with the given
     * parameters.
     * @param {Boolean} [fps] Whether the new camera configuration should be set to FPS-mode. If not given, the current configuration 
     * setting will be used.
     * @param {Float32Array} [positionMatrix] The position matrix of the new configuration. If not given, the current world position will be
     * used.
     * @param {Float32Array} [orientationMatrix] The orientation matrix of the new configuration. If not given, the current world 
     * orientation will be used.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.transitionToFreeCamera = function (fps, positionMatrix, orientationMatrix, duration, style) {
        this._followedNode = null;
        this.startTransitionToConfiguration(this._getFreeCameraConfiguration(fps, positionMatrix, orientationMatrix), duration, style);
    };
    /**
     * Instantly sets a new, free camera configuration (with absolute position and orientation both controllable) with the given parameters
     * for this camera.
     * @param {Boolean} [fps] Whether the new camera configuration should be set to FPS-mode. If not given, the current configuration 
     * setting will be used.
     * @param {Float32Array} [positionMatrix] The position matrix of the new configuration. If not given, the current world position will be
     * used.
     * @param {Float32Array} [orientationMatrix] The orientation matrix of the new configuration. If not given, the current world 
     * orientation will be used.
     */
    Camera.prototype.setToFreeCamera = function (fps, positionMatrix, orientationMatrix) {
        this.transitionToFreeCamera(fps, positionMatrix, orientationMatrix, 0);
    };
    /**
     * Start a new transition from a free camera at the current position and orientation towards the configuration that was already active.
     * This is useful when some property of the current configuration changes, as with this method a smoother transition to the recalculated
     * position / orientation can be displayed.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.transitionToSameConfiguration = function (duration, style) {
        var configuration = this._currentConfiguration;
        this.setConfiguration(this._previousConfiguration ? this._getFreeCameraConfiguration(false) : this._currentConfiguration.copy("", true), true);
        this.startTransitionToConfiguration(configuration, duration, style);
    };
    /**
     * Start a transition to the same configuration, but with its default settings reset. This preserves the reference to the configuration
     * and does not create a copy.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.transitionToConfigurationDefaults = function (duration, style) {
        this.transitionToSameConfiguration(duration, style);
        this._currentConfiguration.resetToDefaults(true);
    };
    /**
     * When a change happens in the settings from the position configuration's side, this method will be called which will apply a default 
     * transition.
     */
    Camera.prototype.positionConfigurationWillChange = function () {
        this.transitionToSameConfiguration();
    };
    /**
     * When a change happens in the settings from the orientation configuration's side, this method will be called which will apply a default 
     * transition.
     */
    Camera.prototype.orientationConfigurationWillChange = function () {
        this.transitionToSameConfiguration();
    };
    /**
     * When a change happens in the settings from the configuration's side, this method will be called which will apply a default transition.
     */
    Camera.prototype.configurationWillChange = function () {
        this.transitionToSameConfiguration();
    };
    Camera.prototype.getFollowedNode = function () {
        return this._followedNode;
    };
    /**
     * If the current position of the camera exceeds plus/minus the given limit on any axis, moves the camera back to the origo and returns
     * the vector by which the objects in the scene need to be moved to stay in sync with the new camera position, otherwise returns null.
     * @param {Number} limit
     * @returns {Number[3]|null}
     */
    Camera.prototype.moveToOrigoIfNeeded = function (limit) {
        var m = this.getCameraPositionMatrix(), result = null;
        if ((m[12] > limit) || (m[12] < -limit) || (m[13] > limit) || (m[13] < -limit) || (m[14] > limit) || (m[14] < -limit)) {
            result = [-m[12], -m[13], -m[14]];
            if (!this._currentConfiguration.positionFollowsObjects()) {
                this._currentConfiguration.setRelativePositionMatrix(mat.identity4(), true);
            }
            if (this._previousConfiguration && !this._previousConfiguration.positionFollowsObjects()) {
                this._previousConfiguration.moveByVector(result, true);
            }
        }
        return result;
    };
    /**
     * Start a transition to the first camera configuration associated with the passed renderable node, if any.
     * @param {RenderableNode} [node] If no node is given, the method will start a transition to the first camera configuration associated
     * with the scene itself.
     * @param {Boolean} forceFirstView If true, then even if the given node is already the followed one, the method will switch to its first
     * camera configuration. Otherwise it will leave the current camera configuration in this case.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     * @returns {Boolean} Whether as a result of this call, the camera is not following the specified node. If the node has no associated
     * configurations to switch to, this will be false.
     */
    Camera.prototype.followNode = function (node, forceFirstView, duration, style) {
        var configuration;
        if (!forceFirstView && (this._followedNode === node)) {
            return true;
        }
        this._followedNode = node;
        if (this._followedNode) {
            configuration = this._followedNode.getNextCameraConfiguration();
            if (configuration) {
                this.startTransitionToConfiguration(configuration, duration, style);
                return true;
            }
            return false;
        }
        // if no node was given
        configuration = this._scene.getNextCameraConfiguration();
        if (configuration) {
            this.startTransitionToConfiguration(configuration, duration, style);
            return true;
        }
        return false;
    };
    /**
     * A convenience methods so that instead of the renderable node, one can specify the renderable object to follow. This will just get
     * the node of the object and follow that.
     * @param {RenderableObject3D} objectToFollow The renderable object the node of which to follow.
     * @param {Boolean} forceFirstView If true, then even if the given object's node is already the followed one, the method will switch to 
     * its first camera configuration. Otherwise it will leave the current camera configuration in this case.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     * @returns {Boolean} Whether as a result of this call, the camera is not following the specified object's node. If the node has no 
     * associated configurations to switch to, this will be false.
     */
    Camera.prototype.followObject = function (objectToFollow, forceFirstView, duration, style) {
        return this.followNode(objectToFollow.getNode(), forceFirstView, duration, style);
    };
    /**
     * Start a transition to the next camera configuration associated with the currently followed node, or the scene, in case no node is
     * followed. If the currently followed configuration is the last one, the first one will be chosen.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.changeToNextView = function (duration, style) {
        if (this._followedNode) {
            // if there is a followed node, that means the current configuration is among its associated configurations, we can safely proceed
            this.startTransitionToConfiguration(this._followedNode.getNextCameraConfiguration(this._currentConfiguration), duration, style);
        } else {
            // if there is no followed node, we need to be more careful, first need to check if the scene has any associated configurations at all
            if (this._scene.getNextCameraConfiguration()) {
                // then we need to check if the current configuration is among the associated ones (it can be a generic free configuration)
                this.startTransitionToConfiguration(this._scene.getNextCameraConfiguration(this._scene.hasCameraConfiguration(this._currentConfiguration) ? this._currentConfiguration : null), duration, style);
            }
        }
    };
    /**
     * Start a transition to the previous camera configuration associated with the currently followed node, or the scene, in case no node is
     * followed. If the currently followed configuration is the first one, the last one will be chosen.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.changeToPreviousView = function (duration, style) {
        if (this._followedNode) {
            // if there is a followed node, that means the current configuration is among its associated configurations, we can safely proceed
            this.startTransitionToConfiguration(this._followedNode.getPreviousCameraConfiguration(this._currentConfiguration), duration, style);
        } else {
            // if there is no followed node, we need to be more careful, first need to check if the scene has any associated configurations at all
            if (this._scene.getNextCameraConfiguration()) {
                // then we need to check if the current configuration is among the associated ones (it can be a generic free configuration)
                this.startTransitionToConfiguration(this._scene.getPreviousCameraConfiguration(this._scene.hasCameraConfiguration(this._currentConfiguration) ? this._currentConfiguration : null), duration, style);
            }
        }
    };
    /**
     * Start a transition to the first associated camera configuration of the next renderable node.
     * @param {Boolean} [considerScene=false] Whether to also consider the scene "as a node". If true, than after the last node, this 
     * method will set the fist configuration associated with the scene rather than jumping right to the first node again.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.followNextNode = function (considerScene, duration, style) {
        var node = this._scene.getNextNode(this._followedNode), originalNode = this._followedNode;
        while ((node !== originalNode) && node && !node.getNextCameraConfiguration()) {
            if (!originalNode) {
                originalNode = node;
            }
            node = this._scene.getNextNode(node);
            if (considerScene && this._followedNode && (node === this._scene.getFirstNode())) {
                if (this.followNode(null, true, duration, style)) {
                    return;
                }
            }
        }
        if (node && node.getNextCameraConfiguration()) {
            this.followNode(node, true, duration, style);
        }
    };
    /**
     * Start a transition to the first associated camera configuration of the previous renderable node.
     * @param {Boolean} [considerScene=false] Whether to also consider the scene "as a node". If true, than after the first node, this 
     * method will set the fist configuration associated with the scene rather than jumping right to the last node again.
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.followPreviousNode = function (considerScene, duration, style) {
        var firstNode = this._scene.getFirstNode(), node = this._scene.getPreviousNode(this._followedNode), originalNode = this._followedNode;
        while ((node !== originalNode) && node && !node.getNextCameraConfiguration()) {
            if (!originalNode) {
                originalNode = node;
            }
            if (considerScene && (node === firstNode)) {
                if (this.followNode(null, true, duration, style)) {
                    return;
                }
            }
            node = this._scene.getPreviousNode(node);
        }
        if (node && node.getNextCameraConfiguration()) {
            this.followNode(node, true, duration, style);
        }
    };
    /**
     * Changes the list of objects that the active configuration's orientation is set to follow.
     * @param {Object3D[]} targetObjects Should not be null, but an empty list, if no objects are to be specified
     * @param {Number} [duration] The duration of the transition, in milliseconds. If not given, the camera default will be used.
     * @param {Number} [style] (enum Camera.prototype.TransitionStyle) The style of the transition to use. If not given, the camera default 
     * will be used.
     */
    Camera.prototype.followOrientationOfObjects = function (targetObjects, duration, style) {
        duration = (duration === undefined) ? this._defaultTransitionDuration : duration;
        if (duration > 0) {
            this.transitionToSameConfiguration(duration, style);
        }
        this._currentConfiguration.setOrientationFollowedObjects(targetObjects, true);
    };
    /**
     * Returns the current progress of the transition, which is a number between 0 and 1 based on which the attributes of the camera can
     * be calculated as a linear combination of the previous and current configurations
     * @returns {Number}
     */
    Camera.prototype._getTransitionProgress = function () {
        var result;
        if (this._transitionDuration === 0) {
            return 0;
        }
        switch (this._transitionStyle) {
            case this.TransitionStyle.LINEAR:
                return this._transitionElapsedTime / this._transitionDuration;
            case this.TransitionStyle.SMOOTH:
                result = this._transitionElapsedTime / this._transitionDuration;
                result = 3 * result * result - 2 * result * result * result;
                return result;
            default:
                application.crash();
        }
        return -1;
    };
    /**
     * Updates the cached value of the current field of view based on the current configuration(s) and transition.
     * @param {Number} transitionProgress The progress value of the current transition.
     */
    Camera.prototype._updateFOV = function (transitionProgress) {
        this._fov = this._previousConfiguration ?
                this._previousConfiguration.getFOV() + (this._currentConfiguration.getFOV() - this._previousConfiguration.getFOV()) * transitionProgress :
                this._currentConfiguration.getFOV();
    };
    /**
     * Updates the cached value of the current span based on the current configuration(s) and transition.
     * @param {Number} transitionProgress The progress value of the current transition.
     */
    Camera.prototype._updateSpan = function (transitionProgress) {
        this._span = this._previousConfiguration ?
                this._previousConfiguration.getSpan() + (this._currentConfiguration.getSpan() - this._previousConfiguration.getSpan()) * transitionProgress :
                this._currentConfiguration.getSpan();
    };
    /**
     * Calculates and sets the world position and orientation and the relative velocity vector of the camera based on the configuration 
     * settings, the transition (if one is in progress) and the commands that were issued by the controller in this simulation step.
     * @param {Number} dt The time that has passed since the last simulation step (in milliseconds)
     */
    Camera.prototype.update = function (dt) {
        var startPositionVector, endPositionVector, previousPositionVector,
                relativeTransitionRotationMatrix, rotations,
                transitionProgress;
        this._extendedCamera = null;
        this._combinedExtendedCamera = null;
        if (this._previousConfiguration) {
            // if a transition is in progress...
            // during transitions, movement and turning commands are not taken into account, therefore updating the configurations without
            // considering those
            if (!this._currentConfiguration.update([0, 0, 0], [0, 0, 0], dt)) {
                this.update(dt);
                return;
            }
            // calculating transition progress based on the elapsed time and the transition style
            this._transitionElapsedTime += dt;
            if (this._transitionElapsedTime > this._transitionDuration) {
                this._transitionElapsedTime = this._transitionDuration;
            }
            transitionProgress = this._getTransitionProgress();
            if (!this._previousConfiguration.update([0, 0, 0], [0, 0, 0], dt)) {
                this.update(dt);
                return;
            }
            // calculate position
            // we can simply interpolate the position on a straight linear path
            startPositionVector = this._previousConfiguration.getPositionVector();
            endPositionVector = this._currentConfiguration.getPositionVector();
            previousPositionVector = this.getCameraPositionVector();
            this._setPositionMatrix(mat.translation4v(vec.sum3(vec.scaled3(startPositionVector, 1 - transitionProgress), vec.scaled3(endPositionVector, transitionProgress))));
            // calculate the velocity vector
            this._velocityVector = vec.scaled3(vec.mulMat4Vec3(this.getCameraOrientationMatrix(), vec.diff3(this.getCameraPositionVector(), previousPositionVector)), 1000 / dt);
            // calculate orientation
            // calculate the rotation matrix that describes the transformation that needs to be applied on the
            // starting orientation matrix to get the new oritentation matrix (relative to the original matrix)
            relativeTransitionRotationMatrix = mat.prod3x3SubOf4(mat.inverseOfRotation4(this._previousConfiguration.getOrientationMatrix()), this._currentConfiguration.getOrientationMatrix());
            rotations = mat.getRotations(relativeTransitionRotationMatrix);
            // now that the two rotations are calculated, we can interpolate the transformation using the angles
            this._setOrientationMatrix(mat.identity4());
            this._rotate(rotations.gammaAxis, rotations.gamma * transitionProgress);
            this._rotate(rotations.alphaAxis, rotations.alpha * transitionProgress);
            this._setOrientationMatrix(mat.correctedOrthogonal4(mat.prod3x3SubOf4(this._previousConfiguration.getOrientationMatrix(), this.getCameraOrientationMatrix())));
            // calculate FOV
            this._updateFOV(transitionProgress);
            this._updateSpan(transitionProgress);
            this._updateProjectionMatrix(this._fov, this._span);
            // if the transition has finished, drop the previous configuration
            if (this._transitionElapsedTime === this._transitionDuration) {
                this._previousConfiguration = null;
            }
        } else {
            // make sure that even if the position / orientation are dependent on each other, both are fully updated for the configuration
            if (!this._currentConfiguration.update(this._controlledVelocityVector, this._angularVelocityVector, dt)) {
                this.update(dt);
                return;
            }
            if (!this._currentConfiguration.update([0, 0, 0], [0, 0, 0], dt)) {
                this.update(dt);
                return;
            }
            // update the position and orientation
            previousPositionVector = this.getCameraPositionVector();
            this._setPositionMatrix(this._currentConfiguration.getPositionMatrix());
            this._setOrientationMatrix(this._currentConfiguration.getOrientationMatrix());
            // update the relative velocity vector
            if (this._currentConfiguration.positionFollowsObjects()) {
                if (this._previousFollowedPositionVector) {
                    this._velocityVector = vec.scaled3(
                            vec.mulMat4Vec3(
                                    this.getCameraOrientationMatrix(),
                                    vec.diff3(
                                            this._currentConfiguration.getFollowedPositionVector(),
                                            this._previousFollowedPositionVector)),
                            1000 / dt);
                } else {
                    this._velocityVector = [0, 0, 0];
                }
                this._previousFollowedPositionVector = this._currentConfiguration.getFollowedPositionVector();
            } else {
                this._velocityVector = vec.scaled3(vec.mulMat4Vec3(this.getCameraOrientationMatrix(), vec.diff3(this.getCameraPositionVector(), previousPositionVector)), 1000 / dt);
            }
        }
    };
    /**
     * Returns (and caches) a camera that has the same overall parameters as this one (with a free configuration), but its view frustum
     * starts where this one's ends and extends beyond it with a total view distance determined by the CAMERA_EXTENSION_FACTOR.
     * @param {Boolean} [includeOriginalFrustum=false] If true, the created extended camera will have the same near plane as the original,
     * and the same far plane as a regular extended camera.
     * @returns {Camera}
     */
    Camera.prototype.getExtendedCamera = function (includeOriginalFrustum) {
        var span, result;
        if (!includeOriginalFrustum && this._extendedCamera) {
            return this._extendedCamera;
        }
        if (includeOriginalFrustum && this._combinedExtendedCamera) {
            return this._combinedExtendedCamera;
        }
        if (this._fov === 0) {
            this._updateFOV();
            this._updateSpan();
        }
        span = includeOriginalFrustum ? this._span : this._span / this._near * this._viewDistance;
        result = new Camera(
                this._scene,
                this._aspect,
                this._usesVerticalValues,
                this._viewDistance * CAMERA_EXTENSION_FACTOR,
                getFreeCameraConfiguration(
                        false,
                        this._object3D.getPositionMatrix(),
                        this._object3D.getOrientationMatrix(),
                        this._fov,
                        this._fov, this._fov,
                        span,
                        span, span));
        result.update(0);
        if (!includeOriginalFrustum) {
            this._extendedCamera = result;
        } else {
            this._combinedExtendedCamera = result;
        }
        return result;
    };
    // -------------------------------------------------------------------------
    // The public interface of the module
    return {
        CameraPositionConfiguration: CameraPositionConfiguration,
        CameraOrientationConfiguration: CameraOrientationConfiguration,
        CameraConfiguration: CameraConfiguration,
        Camera: Camera,
        getFreeCameraConfiguration: getFreeCameraConfiguration
    };
});