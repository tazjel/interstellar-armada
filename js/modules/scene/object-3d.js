/**
 * Copyright 2014-2016 Krisztián Nagy
 * @file Provides a basic class to use as a mixin or base class for 3 dimensional objects.
 * be rendered on them.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 2.0
 */

/*jslint nomen: true, plusplus: true, bitwise: true, white: true */
/*global define, Float32Array, Int32Array */

/**
 * @param vec Used for 3D (and 4D) vector operations.
 * @param mat Used for 3D (and 4D) matrix operations.
 */
define([
    "utils/vectors",
    "utils/matrices"
], function (vec, mat) {
    "use strict";
    var
            // ----------------------------------------------------------------------
            // public functions
            makeObject3DMixinClassFunction, makeObject3DMixinClass;
    // #########################################################################
    /**
     * @class Represents a three dimensional object situated in a virtual space. 
     * This is used as a mixin class, adding its functionality to classes that 
     * have otherwise a different superclass.
     * @constructor
     * @param {Float32Array} [positionMatrix] Initial position.
     * @param {Float32Array} [orientationMatrix] Initial orientation.
     * @param {Float32Array} [scalingMatrix] Initial scaling.
     * @param {Number} [size=1]
     * @returns {Object3D}
     */
    function Object3D(positionMatrix, orientationMatrix, scalingMatrix, size) {
        /**
         * Optional parent, relative to which the position, orientation and
         * scaling of this object is interpreted.
         * @type Object3D
         */
        this._parent = null;
        /**
         * @type Float32Array
         */
        this._positionMatrix = positionMatrix || mat.identity4();
        /**
         * @type Float32Array
         */
        this._orientationMatrix = orientationMatrix || mat.identity4();
        /**
         * @type Float32Array
         */
        this._scalingMatrix = scalingMatrix || mat.identity4();
        /**
         * The cached calculated value of the cascaded scaling matrix (with the scaling of the parent nodes applied).
         * @type Float32Array
         */
        this._cascadeScalingMatrix = null;
        /**
         * Cache variable to store the calculated value of the combined model matrix.
         * @type Float32Array
         */
        this._modelMatrix = null;
        /**
         * The cached calculated value of the cascaded model matrix (with the transformations of the parents applied) for the current frame.
         */
        this._modelMatrixForFrame = null;
        /**
         * Cache variable to store the calculated value of the inverse of the combined model matrix.
         * @type Float32Array
         */
        this._modelMatrixInverse = null;
        /**
         * The cached calculated value of the cascaded inverse model matrix (with the transformations of the parents applied) for the 
         * current frame.
         * @type Float32Array
         */
        this._modelMatrixInverseForFrame = null;
        /**
         * @type Number
         */
        this._size = (size !== undefined) ? size : 1;
        /**
         * Cache value to store whether the object is situated within its 
         * parent's boundaries, as the parent's values can be used for certain 
         * calculations in this case.
         * @type ?Boolean
         */
        this._insideParent = null;
        /**
         * Stored value of the last frustum calculation result. Not used for
         * caching but to avoid creating a new object to store this every time.
         * @type Object
         */
        this._lastSizeInsideViewFrustum = {width: -1, height: -1};
        /**
         * Stores a cached value of the (4x4 translation matrix describing the) position of this 
         * 3D object transformed into camera space. The object needs to be reset to clear this cache, 
         * so a reset needs to be called before the object is used with new or updated camera.
         * @type Float32Array
         */
        this._positionMatrixInCameraSpace = null;
    }
    /**
     * Adds the methods of an Object3D class to the prototype of the class 
     * passed as the 'this' variable (so usage: 
     * makeObject3DMixinClass.call(ClassName)), so subsequently created 
     * instances of it can be used as Object3D instances.
     * It is an IIFE to create the methods themselves only once and cache them
     * in a closure, and only add the references when it is used.
     * @type Function(this:Object3D)
     */
    makeObject3DMixinClassFunction = function () {
        /**
         * Clears cache variables that store calculated values which are only valid for one frame.
         */
        function resetCachedValues() {
            this._positionMatrixInCameraSpace = null;
            this._modelMatrixForFrame = null;
            this._modelMatrixInverseForFrame = null;
        }
        /**
         * Return the parent (might be null).
         * @returns {Object3D}
         */
        function getParent() {
            return this._parent;
        }
        /**
         * Sets a new parent.
         * @param {Object3D} parent
         */
        function setParent(parent) {
            this._parent = parent;
        }
        //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        /**
         * Returns the translation matrix describing the position of the object
         * in world space.
         * @returns {Float32Array}
         */
        function getPositionMatrix() {
            return this._positionMatrix;
        }
        /**
         * Sets a new position matrix.
         * @param {Float32Array} value
         */
        function setPositionMatrix(value) {
            if (value) {
                this._positionMatrix = value;
            }
            this._modelMatrix = null;
            this._modelMatrixInverse = null;
            this._insideParent = null;
            this._positionMatrixInCameraSpace = null;
        }
        /**
         * Returns a 3D vector describing the position.
         * @returns {Number[3]}
         */
        function getPositionVector() {
            return [
                this._positionMatrix[12],
                this._positionMatrix[13],
                this._positionMatrix[14]
            ];
        }
        /**
         * Translates the current position by (x;y;z).
         * @param {Number} x
         * @param {Number} y
         * @param {Number} z
         */
        function translate(x, y, z) {
            mat.translateByVector(this._positionMatrix, [x, y, z]);
            this.setPositionMatrix();
        }
        /**
         * Translates the current position by the given 3D vector.
         * @param {Number[3]} v [x,y,z]
         */
        function translatev(v) {
            mat.translateByVector(this._positionMatrix, v);
            this.setPositionMatrix();
        }
        /**
         * Translates the current position by mutliplying it by the given 
         * matrix.
         * @param {Float32Array} matrix
         */
        function translateByMatrix(matrix) {
            mat.translateByMatrix(this._positionMatrix, matrix);
            this.setPositionMatrix();
        }
        //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        /**
         * Returns the rotation matrix describing the orientation of the object.
         * * @returns {Float32Array}
         */
        function getOrientationMatrix() {
            return this._orientationMatrix;
        }
        /**
         * Sets a new orientation matrix.
         * @param {Float32Array} value
         */
        function setOrientationMatrix(value) {
            if (value) {
                this._orientationMatrix = value;
            }
            this._modelMatrix = null;
            this._modelMatrixInverse = null;
        }
        /**
         * Returns the 3D vector corresponding to the X axis of the current
         * orientation.
         * @returns {Number[3]}
         */
        function getXDirectionVector() {
            return [
                this._orientationMatrix[0],
                this._orientationMatrix[1],
                this._orientationMatrix[2]
            ];
        }
        /**
         * Returns the 3D vector corresponding to the Y axis of the current
         * orientation.
         * @returns {Number[3]}
         */
        function getYDirectionVector() {
            return [
                this._orientationMatrix[4],
                this._orientationMatrix[5],
                this._orientationMatrix[6]
            ];
        }
        /**
         * Returns the 3D vector corresponding to the Z axis of the current
         * orientation.
         * @returns {Number[3]}
         */
        function getZDirectionVector() {
            return [
                this._orientationMatrix[8],
                this._orientationMatrix[9],
                this._orientationMatrix[10]
            ];
        }
        /**
         * Rotates the current orientation around the given axis by the given
         * angle.
         * @param {Number[3]} axis The 3D vector of the axis.
         * @param {Number} angle Angle in radians.
         */
        function rotate(axis, angle) {
            if (angle !== 0) {
                mat.rotate4(this._orientationMatrix, axis, angle);
                this.setOrientationMatrix();
            }
        }
        /**
         * Rotates the current orientation by multiplying it by the given 
         * rotation matrix.
         * @param {Float32Array} matrix
         */
        function rotateByMatrix(matrix) {
            mat.mul4(this._orientationMatrix, matrix);
            this.setOrientationMatrix();
        }
        //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        /**
         * Returns the scaling matrix describing the size of the object. 
         * * @returns {Float32Array}
         */
        function getScalingMatrix() {
            return this._scalingMatrix;
        }
        /**
         * Sets a new scaling matrix.
         * @param {Float32Array} value
         */
        function setScalingMatrix(value) {
            this._scalingMatrix = value;
            this._modelMatrix = null;
            this._modelMatrixInverse = null;
            this._cascadeScalingMatrix = null;
        }
        /**
         * A convenience method to set uniform scaling
         * @param {Number} scale The scaling to apply to all 3 axes
         */
        function setScale(scale) {
            this.setScalingMatrix(mat.scaling4(scale));
        }
        /**
         * Returns a scaling matrix corresponding to the stacked scaling applied
         * on this object originating both from its parents' and own scaling.
         * @returns {Float32Array}
         */
        function getCascadeScalingMatrix() {
            if (!this._cascadeScalingMatrix) {
                this._cascadeScalingMatrix = this._parent ?
                        mat.prod3x3SubOf4(this._parent.getCascadeScalingMatrix(), this._scalingMatrix) :
                        this._scalingMatrix;
            }
            return this._cascadeScalingMatrix;
        }
        //++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++++
        /**
         * Returns the calculated combined model matrix of this object (and its parents). Uses cache.
         * @returns {Float32Array}
         */
        function getModelMatrix() {
            if (!this._modelMatrixForFrame) {
                this._modelMatrix = this._modelMatrix || mat.translationRotation(this._positionMatrix, mat.prod3x3SubOf4(this._scalingMatrix, this._orientationMatrix));
                this._modelMatrixForFrame = this._parent ?
                        mat.prod4(this._modelMatrix, this._parent.getModelMatrix()) :
                        this._modelMatrix;
            }
            return this._modelMatrixForFrame;
        }
        /**
         * Returns the calculated inverse of the combined model matrix of this object (and its parents). Uses cache.
         * @returns {Float32Array}
         */
        function getModelMatrixInverse() {
            if (!this._modelMatrixInverseForFrame) {
                this._modelMatrixInverse = this._modelMatrixInverse || mat.inverse4(this.getModelMatrix());
                this._modelMatrixInverseForFrame = this._parent ?
                        mat.prod4(this._parent.getModelMatrixInverse(), this._modelMatrixInverse) :
                        this._modelMatrixInverse;
            }
            return this._modelMatrixInverseForFrame;
        }
        /**
         * Returns the size of this object.
         * @returns {Number}
         */
        function getSize() {
            return this._size;
        }
        /**
         * Returns the size of this object in world space, accounting for all 
         * the scaling.
         * @returns {Number}
         */
        function getScaledSize() {
            return this.getSize() * this.getCascadeScalingMatrix()[0];
        }
        /**
         * Returns whether the object is situated within the boundaries of its
         * parent. Uses cache.
         * @returns {Boolean}
         */
        function isInsideParent() {
            if (this._insideParent === null) {
                this._insideParent = this._parent ?
                        (Math.abs(this.getPositionMatrix()[12]) < this._parent.getSize()) &&
                        (Math.abs(this.getPositionMatrix()[13]) < this._parent.getSize()) &&
                        (Math.abs(this.getPositionMatrix()[14]) < this._parent.getSize())
                        : false;
            }
            return this._insideParent;
        }
        /**
         * Returns position matrix transformed into camera space using the passed camera.
         * Within one frame, the value is cached to avoid calculating it multiple times
         * for the same camera.
         * @param {Camera} camera
         * @returns {Float32Array}
         */
        function getPositionMatrixInCameraSpace(camera) {
            if (!this._positionMatrixInCameraSpace) {
                this._positionMatrixInCameraSpace =
                        mat.translation4v(vec.mulVec4Mat4(mat.translationVector4(this.getModelMatrix()), camera.getViewMatrix()));
            }
            return this._positionMatrixInCameraSpace;
        }
        /**
         * Checks if the object is inside the viewing frustum of the passed camera, taking into account the parents of the object as well. 
         * Also sets the view width and height members of the object to cache them for the current frame.
         * @param {Camera} camera The camera the frustum of which is to be checked
         * @param {Boolean} [checkNearAndFarPlanes=false] Whether to check if the object is between the near and far cutting planes of the 
         * frustum - this is disabled by default as this easier check is normally done separately in advance to organize the objects into
         * rendering queues by distance.
         * @returns {Object} 
         */
        function getSizeInsideViewFrustum(camera, checkNearAndFarPlanes) {
            var size, scalingMatrix, baseMatrix, fullMatrix, position, xOffsetPosition, yOffsetPosition, xOffset, yOffset, factor;
            // scaling and orientation is lost here, since we create a new translation matrix based on the original transformation
            baseMatrix = this.getPositionMatrixInCameraSpace(camera);
            scalingMatrix = this.getCascadeScalingMatrix();
            // frustum culling: back and front
            if (checkNearAndFarPlanes) {
                size = this.getSize() * scalingMatrix[0];
                if ((baseMatrix[14] - size >= -camera.getNearDistance()) || ((baseMatrix[14] + size) < -camera.getViewDistance())) {
                    this._lastSizeInsideViewFrustum.width = 0;
                    this._lastSizeInsideViewFrustum.height = 0;
                    return this._lastSizeInsideViewFrustum;
                }
            }
            // we reintroduce appropriate scaling, but not the orientation, so 
            // we can check border points of the properly scaled model, but translated
            // along the axes of the camera space
            fullMatrix = mat.prod34(scalingMatrix, baseMatrix, camera.getProjectionMatrix());
            size = this.getSize();
            factor = 1 / fullMatrix[15];
            position = [
                (fullMatrix[12] === 0.0) ? 0.0 : fullMatrix[12] * factor,
                (fullMatrix[13] === 0.0) ? 0.0 : fullMatrix[13] * factor,
                (fullMatrix[14] === 0.0) ? 0.0 : fullMatrix[14] * factor];
            // frustum culling: sides
            xOffsetPosition = vec.mulVec4Mat4([size, 0.0, 0.0, 1.0], fullMatrix);
            yOffsetPosition = vec.mulVec4Mat4([0.0, size, 0.0, 1.0], fullMatrix);
            xOffset = Math.abs(((xOffsetPosition[0] === 0.0) ? 0.0 : xOffsetPosition[0] / xOffsetPosition[3]) - position[0]);
            yOffset = Math.abs(((yOffsetPosition[1] === 0.0) ? 0.0 : yOffsetPosition[1] / yOffsetPosition[3]) - position[1]);
            if (!((position[0] + xOffset < -1) || (position[0] - xOffset > 1)) &&
                    !((position[1] + yOffset < -1) || (position[1] - yOffset > 1))) {
                this._lastSizeInsideViewFrustum.width = xOffset;
                this._lastSizeInsideViewFrustum.height = yOffset;
                return this._lastSizeInsideViewFrustum;
            }
            this._lastSizeInsideViewFrustum.width = 0;
            this._lastSizeInsideViewFrustum.height = 0;
            return this._lastSizeInsideViewFrustum;
        }
        /**
         * Returns whether the object (or at least a part of it) lies within a specific shadow map region.
         * @param {Float32Array} lightMatrix The 4x4 matrix to transform coordinates from world into shadow (light) space.
         * @param {Number} range The world-space distance from the center to the sides of planes of shadow map region perpendicular to the
         * light.
         * @param {Number} depthRatio The factor by which the depth of the shadow map region (its size along the axis parallel to light
         * rays) is larger than its width/height (specified by range).
         * @returns {Boolean}
         */
        function isInsideShadowRegion(lightMatrix, range, depthRatio) {
            var positionInLightSpace, size;
            positionInLightSpace = vec.mulVec4Mat4(mat.translationVector4(this.getModelMatrix()), lightMatrix);
            size = this.getScaledSize();
            return (Math.abs(positionInLightSpace[0]) - size < range) &&
                    (Math.abs(positionInLightSpace[1]) - size < range) &&
                    (Math.abs(positionInLightSpace[2]) - size < range * depthRatio);
        }
        // interface of an Object3D mixin
        return function () {
            this.prototype.resetCachedValues = resetCachedValues;
            this.prototype.getParent = getParent;
            this.prototype.setParent = setParent;
            this.prototype.getPositionMatrix = getPositionMatrix;
            this.prototype.setPositionMatrix = setPositionMatrix;
            this.prototype.getOrientationMatrix = getOrientationMatrix;
            this.prototype.setOrientationMatrix = setOrientationMatrix;
            this.prototype.getScalingMatrix = getScalingMatrix;
            this.prototype.setScalingMatrix = setScalingMatrix;
            this.prototype.setScale = setScale;
            this.prototype.getPositionVector = getPositionVector;
            this.prototype.translate = translate;
            this.prototype.translatev = translatev;
            this.prototype.translateByMatrix = translateByMatrix;
            this.prototype.getXDirectionVector = getXDirectionVector;
            this.prototype.getYDirectionVector = getYDirectionVector;
            this.prototype.getZDirectionVector = getZDirectionVector;
            this.prototype.rotate = rotate;
            this.prototype.rotateByMatrix = rotateByMatrix;
            this.prototype.getCascadeScalingMatrix = getCascadeScalingMatrix;
            this.prototype.getModelMatrix = getModelMatrix;
            this.prototype.getModelMatrixInverse = getModelMatrixInverse;
            this.prototype.getSize = getSize;
            this.prototype.getScaledSize = getScaledSize;
            this.prototype.isInsideParent = isInsideParent;
            this.prototype.getPositionMatrixInCameraSpace = getPositionMatrixInCameraSpace;
            this.prototype.getSizeInsideViewFrustum = getSizeInsideViewFrustum;
            this.prototype.isInsideShadowRegion = isInsideShadowRegion;
        };
    };
    makeObject3DMixinClass = makeObject3DMixinClassFunction();
    makeObject3DMixinClass.call(Object3D);
    // -------------------------------------------------------------------------
    // The public interface of the module
    return {
        Object3D: Object3D,
        makeObject3DMixinClass: makeObject3DMixinClass
    };
});