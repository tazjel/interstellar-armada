/**
 * Copyright 2014-2015 Krisztián Nagy
 * @file 
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 1.0
 */

/*jslint nomen: true, white: true */
/*global define */

define([
    "utils/vectors"
], function (vec) {
    "use strict";

    var mat = {};

    // -----------------------------------------------------------------------------
// Functions that create new matrices

    /**
     * Returns a 3x3 identity matrix.
     * @returns {Float32Array}
     */
    mat.identity3 = function () {
        return new Float32Array([
            1.0, 0.0, 0.0,
            0.0, 1.0, 0.0,
            0.0, 0.0, 1.0
        ]);
    };

    /**
     * Returns a 4x4 identity matrix.
     * @returns {Float32Array}
     */
    mat.identity4 = function () {
        return new Float32Array([
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            0.0, 0.0, 0.0, 1.0
        ]);
    };

    /**
     * Returns a 3x3 null matrix.
     * @returns {Float32Array}
     */
    mat.null3 = function () {
        return new Float32Array([
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0,
            0.0, 0.0, 0.0
        ]);
    };

    /**
     * Returns a 4x4 null matrix.
     * @returns {Float32Array}
     */
    mat.null4 = function () {
        return new Float32Array([
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0,
            0.0, 0.0, 0.0, 0.0
        ]);
    };

    /**
     * Return a 3x3 matrix comprised of the first 9 elements of the passed array.
     * @param {Float32Array|Number[9]} m
     * @returns {Float32Array}
     */
    mat.matrix3 = function (m) {
        return new Float32Array([
            m[0], m[1], m[2],
            m[3], m[4], m[5],
            m[6], m[7], m[8]
        ]);
    };

    /**
     * Return a 4x4 matrix comprised of the first 16 elements of the passed array.
     * @param {Float32Array|Number[16]} m
     * @returns {Float32Array}
     */
    mat.matrix4 = function (m) {
        return new Float32Array([
            m[0], m[1], m[2], m[3],
            m[4], m[5], m[6], m[7],
            m[8], m[9], m[10], m[11],
            m[12], m[13], m[14], m[15]
        ]);
    };

    /**
     * Returns a 4x4 transformation matrix describing a translation.
     * @param {Number} x The x coordinate of the translation.
     * @param {Number} y The y coordinate of the translation.
     * @param {Number} z The z coordinate of the translation.
     * @returns {Float32Array}
     */
    mat.translation4 = function (x, y, z) {
        return new Float32Array([
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            x, y, z, 1.0
        ]);
    };

    /**
     * Returns a 4x4 transformation matrix describing a translation.
     * @param {Number[3]} v The vector of the translation ([x,y,z]).
     * @returns {Float32Array}
     */
    mat.translation4v = function (v) {
        return new Float32Array([
            1.0, 0.0, 0.0, 0.0,
            0.0, 1.0, 0.0, 0.0,
            0.0, 0.0, 1.0, 0.0,
            v[0], v[1], v[2], 1.0
        ]);
    };

    /**
     * Returns a new 4x4 transformation matrix describing a rotation along an
     * arbitrary axis.
     * @param {Number[]} axis An array of 3 numbers describing the axis of the
     * rotation
     * @param {Number} angle The angle of rotation in radian
     */
    mat.rotation4 = function (axis, angle) {
        var cosAngle = Math.cos(angle);
        var sinAngle = Math.sin(angle);
        return new Float32Array([
            cosAngle + (1 - cosAngle) * axis[0] * axis[0], (1 - cosAngle) * axis[0] * axis[1] - sinAngle * axis[2], (1 - cosAngle) * axis[0] * axis[2] + sinAngle * axis[1], 0.0,
            (1 - cosAngle) * axis[0] * axis[1] + sinAngle * axis[2], cosAngle + (1 - cosAngle) * axis[1] * axis[1], (1 - cosAngle) * axis[1] * axis[2] - sinAngle * axis[0], 0.0,
            (1 - cosAngle) * axis[0] * axis[2] - sinAngle * axis[1], (1 - cosAngle) * axis[1] * axis[2] + sinAngle * axis[0], cosAngle + (1 - cosAngle) * axis[2] * axis[2], 0.0,
            0.0, 0.0, 0.0, 1.0
        ]);
    };

    /**
     * Returns a 4x4 transformation matrix describing a scaling along the 3 axes.
     * @param {Number} x Scaling along axis X.
     * @param {Number} [y] Scaling along axis Y. If omitted, the same scaling will
     * be used for all 3 axes.
     * @param {Number} [z] Scaling along axis Z. If omitted, the same scaling will
     * be used for all 3 axes.
     * @returns {Float32Array}
     */
    mat.scaling4 = function (x, y, z) {
        y = y || x;
        z = z || x;
        return new Float32Array([
            x, 0.0, 0.0, 0.0,
            0.0, y, 0.0, 0.0,
            0.0, 0.0, z, 0.0,
            0.0, 0.0, 0.0, 1.0]
              );
    };

    /**
     * Returns a 4x4 transformation matrix describing a perspective projection.
     * @param {Number} right
     * @param {Number} top
     * @param {Number} near
     * @param {Number} far
     * @returns {Float32Array}
     */
    mat.perspective4 = function (right, top, near, far) {
        return new Float32Array([
            near / right, 0.0, 0.0, 0.0,
            0.0, near / top, 0.0, 0.0,
            0.0, 0.0, (near + far) / (near - far), -1.0,
            0.0, 0.0, 2 * near * far / (near - far), 0.0
        ]);
    };

    /**
     * Returns a 4x4 transformation matrix describing an orthographic projection.
     * @param {Number} right
     * @param {Number} top
     * @param {Number} near
     * @param {Number} far
     * @returns {Float32Array}
     */
    mat.orthographic4 = function (right, top, near, far) {
        return new Float32Array([
            1 / right, 0.0, 0.0, 0.0,
            0.0, 1 / top, 0.0, 0.0,
            0.0, 0.0, -2 / (far - near), 0.0,
            0.0, 0.0, (far + near) / (far - near), 1.0
        ]);
    };

    /**
     * Returns a 4x4 translation matrix created based on the vector described by the
     * attributes of the passed XML element.
     * @param {Element} tag
     * @returns {Float32Array} A 4x4 transformation matrix.
     */
    mat.translationFromXMLTag = function (tag) {
        return mat.translation4v(vec.fromXMLTag3(tag));
    };

    /**
     * Constructs and returns a 4x4 rotation matrix described by a series of rotations
     * stored in the XML tags.
     * @param {XMLElement[]} tags The tags describing rotations.
     * @returns {Float32Array} The costructed rotation matrix.
     */
    mat.rotation4FromXMLTags = function (tags) {
        var result = mat.identity4();
        for (var i = 0; i < tags.length; i++) {
            var axis = [0, 0, 0];
            if (tags[i].getAttribute("axis") === "x") {
                axis = [1, 0, 0];
            } else
            if (tags[i].getAttribute("axis") === "y") {
                axis = [0, 1, 0];
            } else
            if (tags[i].getAttribute("axis") === "z") {
                axis = [0, 0, 1];
            }
            result =
                  mat.mul4(
                        result,
                        mat.rotation4(
                              axis,
                              parseFloat(tags[i].getAttribute("degree")) / 180 * 3.1415
                              )
                        );
        }
        return result;
    };

    /**
     * Returns a 3x3 vector the rows of which are made up of the vx,vy,vz vectors.
     * @param {Number[]} vx A 3D or 4D vector.
     * @param {Number[]} vy A 3D or 4D vector.
     * @param {Number[]} vz A 3D or 4D vector.
     * @returns {Float32Array}
     */
    mat.fromVectorsTo3 = function (vx, vy, vz) {
        return new Float32Array([
            vx[0], vx[1], vx[2],
            vy[0], vy[1], vy[2],
            vz[0], vz[1], vz[2]
        ]);
    };

    /**
     * Returns a 4x4 vector the rows of which are made up of the vx,vy,vz and if
     * given, vw (otherwise 0,0,0,1) vectors. The 4th elements are substituted by a
     * zero if the vectors are three dimensional.
     * @param {Number[]} vx A 3D or 4D vector.
     * @param {Number[]} vy A 3D or 4D vector.
     * @param {Number[]} vz A 3D or 4D vector.
     * @param {Number[]} vw A 3D or 4D vector.
     * @returns {Float32Array}
     */
    mat.fromVectorsTo4 = function (vx, vy, vz, vw) {
        vw = vw || [0.0, 0.0, 0.0, 1.0];
        return new Float32Array([
            vx[0], vx[1], vx[2], vx.length > 3 ? vx[3] : 0.0,
            vy[0], vy[1], vy[2], vy.length > 3 ? vy[3] : 0.0,
            vz[0], vz[1], vz[2], vz.length > 3 ? vz[3] : 0.0,
            vw[0], vw[1], vw[2], vw[3]
        ]);
    };

// -----------------------------------------------------------------------------
// Functions of a single matrix

    /**
     * Returns the first row vector of a 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Number[4]}
     */
    mat.getRowA4 = function (m) {
        return [m[0], m[1], m[2], m[3]];
    };

    /**
     * Returns the second row vector of a 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Number[4]}
     */
    mat.getRowB4 = function (m) {
        return [m[4], m[5], m[6], m[7]];
    };

    /**
     * Returns the third row vector of a 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Number[4]}
     */
    mat.getRowC4 = function (m) {
        return [m[8], m[9], m[10], m[11]];
    };

    /**
     * Returns the fourth row vector of a 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Number[4]}
     */
    mat.getRowD4 = function (m) {
        return [m[12], m[13], m[14], m[15]];
    };

    /**
     * Returns the determinant of the passed 3x3 matrix.
     * @param {Float32Array} m A 3x3 matrix.
     * @returns {Number} The determinant of m.
     */
    mat.determinant3 = function (m) {
        return (
              m[0] * m[4] * m[8] + m[1] * m[5] * m[6] + m[2] * m[3] * m[7] -
              m[2] * m[4] * m[6] - m[1] * m[3] * m[8] - m[0] * m[5] * m[7]
              );
    };

    /**
     * Returns the 3D vector corresponding to the translation the passed 4x4 matrix
     * describes.
     * @param {Float32Array} m A 4x4 transformation matrix.
     * @returns {Number[3]}
     */
    mat.translationVector3 = function (m) {
        return [m[12], m[13], m[14]];
    };

    /**
     * Returns the 4D vector corresponding to the translation the passed 4x4 matrix
     * describes.
     * @param {Float32Array} m A 4x4 transformation matrix.
     * @returns {Number[4]}
     */
    mat.translationVector4 = function (m) {
        return [m[12], m[13], m[14], m[15]];
    };

    /**
     * Returns the length of the vector of the translation described by the passed
     * 4x4 transformation matrix.
     * @param {Float32Array} m A 4x4 transformation matrix.
     * @returns {Number}
     */
    mat.translationLength = function (m) {
        return vec.length3([m[12], m[13], m[14]]);
    };

    /**
     * Returns the string representation of a 3x3 matrix.
     * @param {Float32Array} m A 3x3 matrix.
     * @param {Number} [d=2] The number of decimals to include in the string for the 
     * matrix components.
     * @returns {String}
     */
    mat.toString3 = function (m, d) {
        d = d || 2;
        return m[0].toFixed(d) + " " + m[1].toFixed(d) + " " + m[2].toFixed(d) + "\n" +
              m[3].toFixed(d) + " " + m[4].toFixed(d) + " " + m[5].toFixed(d) + "\n" +
              m[6].toFixed(d) + " " + m[7].toFixed(d) + " " + m[8].toFixed(d);
    };

    /**
     * Returns the string representation of a 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @param {Number} [d=2] The number of decimals to include in the string for the 
     * matrix components.
     * @returns {String}
     */
    mat.toString4 = function (m, d) {
        d = d || 2;
        return m[0].toFixed(d) + " " + m[1].toFixed(d) + " " + m[2].toFixed(d) + " " + m[3].toFixed(d) + "\n" +
              m[4].toFixed(d) + " " + m[5].toFixed(d) + " " + m[6].toFixed(d) + " " + m[7].toFixed(d) + "\n" +
              m[8].toFixed(d) + " " + m[9].toFixed(d) + " " + m[10].toFixed(d) + " " + m[11].toFixed(d) + "\n" +
              m[12].toFixed(d) + " " + m[13].toFixed(d) + " " + m[14].toFixed(d) + " " + m[15].toFixed(d);
    };

    /**
     * Returns the string representation of a 4x4 matrix, with HTML markup to indicate
     * line breaks.
     * @param {Float32Array} m A 4x4 matrix.
     * @param {Number} [d=2] The number of decimals to include in the string for the 
     * matrix components.
     * @returns {String}
     */
    mat.toHTMLString4 = function (m, d) {
        d = d || 2;
        return m[0].toFixed(d) + " " + m[1].toFixed(d) + " " + m[2].toFixed(d) + " " + m[3].toFixed(d) + "<br/>" +
              m[4].toFixed(d) + " " + m[5].toFixed(d) + " " + m[6].toFixed(d) + " " + m[7].toFixed(d) + "<br/>" +
              m[8].toFixed(d) + " " + m[9].toFixed(d) + " " + m[10].toFixed(d) + " " + m[11].toFixed(d) + "<br/>" +
              m[12].toFixed(d) + " " + m[13].toFixed(d) + " " + m[14].toFixed(d) + " " + m[15].toFixed(d);
    };

// -----------------------------------------------------------------------------
// Functions that transform a matrix

    /**
     * Returns the 3x3 top-left submatrix of the passed 4x4 matrix.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Float32Array}
     */
    mat.matrix3from4 = function (m) {
        return new Float32Array([
            m[0], m[1], m[2],
            m[4], m[5], m[6],
            m[8], m[9], m[10]
        ]);
    };

    /**
     * Returns a 4x4 matrix by taking the 3x3 matrix m, and complementing it with
     * a last column and row of a 4x4 identity matrix.
     * @param {Float32Array} m A 3x3 matrix.
     * @returns {Float32Array}
     */
    mat.matrix4from3 = function (m) {
        return new Float32Array([
            m[0], m[1], m[2], 0.0,
            m[3], m[4], m[5], 0.0,
            m[6], m[7], m[8], 0.0,
            0.0, 0.0, 0.0, 1.0
        ]);
    };

    /**
     * Returns the transposed of the passed 3x3 matrix m.
     * @param {Float32Array} m A 3x3 matrix.
     * @returns {Float32Array} The transposed of m.
     */
    mat.transposed3 = function (m) {
        return new Float32Array([
            m[0], m[3], m[6],
            m[1], m[4], m[7],
            m[2], m[5], m[8]
        ]);
    };

    /**
     * Returns the transposed of the passed 4x4 matrix m.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Float32Array} The transposed of m.
     */
    mat.transposed4 = function (m) {
        return new Float32Array([
            m[0], m[4], m[8], m[12],
            m[1], m[5], m[9], m[13],
            m[2], m[6], m[10], m[14],
            m[3], m[7], m[11], m[15]
        ]);
    };

    /**
     * Returns the inverse of the passed 3x3 matrix m.
     * @param {Float32Array} m A 3x3 matrix.
     * @returns {Float32Array} The inverse of m.
     */
    mat.inverse3 = function (m) {
        var i, j, k;
        var t, u;
        var m2 = new Float32Array(m);
        // we will use Gauss-Jordan elimination, so an identity matrix will be augmented to
        // the right of the original matrix
        var result = mat.identity3();
        var swap;
        // check by the determinant, if the matrix is invertible
        if (mat.determinant3(m2) === 0) {
            return mat.null3();
        } else {
            // calculate the inverse by Gaussian-Jordan elimination
            // first part: forward elimination
            // for each row...
            for (i = 0; i < 3; i++) {
                // first swap the row to have a non-zero element at the diagonal
                // position, if needed
                if (Math.abs(m2[i * 4]) <= 0.0001) {
                    // first, find a non-zero element in the same (i) column
                    j = i + 1;
                    while (Math.abs(m2[j * 3 + i]) <= 0.0001) {
                        j++;
                    }
                    // when found it in row 'j' swap the 'i'th and 'j'th rows
                    for (k = 0; k < 3; k++) {
                        swap = m2[i * 3 + k];
                        m2[i * 3 + k] = m2[j * 3 + k];
                        m2[j * 3 + k] = swap;
                        swap = result[i * 3 + k];
                        result[i * 3 + k] = result[j * 3 + k];
                        result[j * 3 + k] = swap;
                    }
                }
                // divide all elements of the row by the value of the element in the
                // main diagonal (within that row), to make it equal one
                t = m2[i * 4];
                for (j = 0; j < 3; j++) {
                    m2[i * 3 + j] = m2[i * 3 + j] / t;
                    result[i * 3 + j] = result[i * 3 + j] / t;
                }
                // subtract the row from all rows below it, multiplied accordingly
                // to null out the elements below the main diagonal element
                for (j = i + 1; j < 3; j++) {
                    u = m2[j * 3 + i] / m2[i * 4];
                    for (k = 0; k < 3; k++) {
                        m2[j * 3 + k] = m2[j * 3 + k] - u * m2[i * 3 + k];
                        result[j * 3 + k] = result[j * 3 + k] - u * result[i * 3 + k];
                    }
                }
            }
            // back-substitution phase: eliminate the upper part of the original
            // matrix - however, these final values hold no additional information
            // for the calculations, so the operations are only done on the right
            // matrix, which will hold the inverse in the end
            for (i = 2; i >= 1; i--) {
                for (j = i - 1; j >= 0; j--) {
                    for (k = 0; k < 3; k++) {
                        result[j * 3 + k] = result[j * 3 + k] - m2[j * 3 + i] * result[i * 3 + k];
                    }
                }
            }
        }
        return result;
    };

    /**
     * Returns the inverse of the passed 4x4 matrix m.
     * @param {Float32Array} m A 4x4 matrix.
     * @returns {Float32Array} The inverse of m.
     */
    mat.inverse4 = function (m) {
        var i, j, k;
        var t, u;
        var m2 = new Float32Array(m);
        // we will use Gauss-Jordan elimination, so an identity matrix will be augmented to
        // the right of the original matrix
        var result = mat.identity4();
        var swap;
        // we assume that the matrix is invertible (for efficiency, and since in all
        // uses cases it should be)
        // calculate the inverse by Gaussian-Jordan elimination
        // first part: forward elimination
        // for each row...
        for (i = 0; i < 4; i++) {
            // first swap the row to have a non-zero element at the diagonal
            // position, if needed
            if (Math.abs(m2[i * 5]) <= 0.0001) {
                // first, find a non-zero element in the same (i) column
                j = i + 1;
                while (Math.abs(m2[j * 4 + i]) <= 0.0001) {
                    j++;
                }
                // when found it in row 'j' swap the 'i'th and 'j'th rows
                for (k = 0; k < 4; k++) {
                    swap = m2[i * 4 + k];
                    m2[i * 4 + k] = m2[j * 4 + k];
                    m2[j * 4 + k] = swap;
                    swap = result[i * 4 + k];
                    result[i * 4 + k] = result[j * 4 + k];
                    result[j * 4 + k] = swap;
                }
            }
            // divide all elements of the row by the value of the element in the
            // main diagonal (within that row), to make it equal one
            t = m2[i * 5];
            for (j = 0; j < 4; j++) {
                m2[i * 4 + j] = m2[i * 4 + j] / t;
                result[i * 4 + j] = result[i * 4 + j] / t;
            }
            // subtract the row from all rows below it, multiplied accordingly
            // to null out the elements below the main diagonal element
            for (j = i + 1; j < 4; j++) {
                u = m2[j * 4 + i] / m2[i * 5];
                for (k = 0; k < 4; k++) {
                    m2[j * 4 + k] = m2[j * 4 + k] - u * m2[i * 4 + k];
                    result[j * 4 + k] = result[j * 4 + k] - u * result[i * 4 + k];
                }
            }
        }
        // back-substitution phase: eliminate the upper part of the original
        // matrix - however, these final values hold no additional information
        // for the calculations, so the operations are only done on the right
        // matrix, which will hold the inverse in the end
        for (i = 3; i >= 1; i--) {
            for (j = i - 1; j >= 0; j--) {
                for (k = 0; k < 4; k++) {
                    result[j * 4 + k] = result[j * 4 + k] - m2[j * 4 + i] * result[i * 4 + k];
                }
            }
        }
        return result;
    };

    /**
     * A computationally efficient function to return the inverse of a 4x4 translation
     * matrix. (a transformation matrix that only hold translation information)
     * @param {Float32Array} m The input 4x4 matrix.
     * @returns {Float32Array} The calculated inverse 4x4 matrix.
     */
    mat.inverseOfTranslation4 = function (m) {
        return mat.translation4(-m[12], -m[13], -m[14]);
    };

    /**
     * Calculates and returns the inverse of the top left 3x3 block of a 4x4 matrix,
     * but complemented to 4x4 matrix (using identity matrix values for the rest part).
     * Can be used to calculate the inverse of a rotation (or scaling) described in
     * the 3x3 part of a 4x4 matrix without letting the optional translation
     * interfere with it.
     * @param {Float32Array} m The input 4x4 matrix.
     * @returns {Float32Array} The calculated inverse, complemented 4x4 matrix.
     */
    mat.inverseOfRotation4 = function (m) {
        return mat.matrix4from3(mat.inverse3(mat.matrix3from4(m)));
    };

    /**
     * A computationally efficient function to return the inverse of a 4x4 scaling
     * matrix. (a transformation matrix that only hold scaling information)
     * @param {Float32Array} m A 4x4 scaling matrix.
     * @returns {Float32Array} The calculated inverse 4x4 matrix.
     */
    mat.inverseOfScaling4 = function (m) {
        return mat.scaling4(1 / m[0], 1 / m[5], 1 / m[10]);
    };

    /**
     * Returns a 3x3 matrix multiplied by a scalar.
     * @param {Float32Array} m A 3x3 matrix.
     * @param {Number} s A scalar.
     * @returns {Float32Array} m multiplied by s.
     */
    mat.scaled3 = function (m, s) {
        return new Float32Array([
            m[0] * s, m[1] * s, m[2] * s,
            m[3] * s, m[4] * s, m[5] * s,
            m[6] * s, m[7] * s, m[8] * s
        ]);
    };

    /**
     * Returns a 4x4 matrix multiplied by a scalar.
     * @param {Float32Array} m A 4x4 matrix.
     * @param {Number} s A scalar.
     * @returns {Float32Array} m multiplied by s.
     */
    mat.scaled4 = function (m, s) {
        return new Float32Array([
            m[0] * s, m[1] * s, m[2] * s, m[3] * s,
            m[4] * s, m[5] * s, m[6] * s, m[7] * s,
            m[8] * s, m[9] * s, m[10] * s, m[11] * s,
            m[12] * s, m[13] * s, m[14] * s, m[15] * s
        ]);
    };

    /**
     * Returns a corrected matrix based on the passed one, which has orthogonal unit
     * vectors as its rows. Suitable for correcting minor distortions of originally
     * orthogonal matrices, which naturally occur after series of transformations
     * due to float inaccuracy .
     * @param {Float32Array} m The original (distorted) 4x4 matrix.
     * @returns {Float32Array} An orthogonal 4x4 matrix.
     */
    mat.correctedOrthogonal4 = function (m) {
        var vx = vec.normal3([m[0], m[1], m[2]]);
        var vy = vec.normal3([m[4], m[5], m[6]]);
        var vz = vec.cross3(vx, vy);
        vy = vec.cross3(vz, vx);
        return new Float32Array([
            vx[0], vx[1], vx[2], 0.0,
            vy[0], vy[1], vy[2], 0.0,
            vz[0], vz[1], vz[2], 0.0,
            0.0, 0.0, 0.0, 1.0]);
    };

    /**
     * Returns a "straigthened" version of the passed matrix, wich means every value
     * within the matrix that is at least epsilon-close to -1, 0 or 1 will be changed
     * to -1, 0 or 1 respectively. Works with both 3x3 and 4x4 matrices.
     * @param {Float32Array} m The input matrix.
     * @param {Number} epsilon The difference threshold within the matrix components
     * will be corrected.
     * @returns {Float32Array}
     */
    mat.straightened = function (m, epsilon) {
        var result = new Float32Array(m);
        for (var i = 0; i < result.length; i++) {
            result[i] = (Math.abs(m[i]) < epsilon) ?
                  0.0 :
                  ((Math.abs(1 - m[i]) < epsilon) ?
                        1.0 :
                        ((Math.abs(-1 - m[i]) < epsilon) ?
                              -1.0 : m[i]));
        }
        return result;
    };

// -----------------------------------------------------------------------------
// Functions and operations with two matrices

    /**
     * Returns whether the passed two 4x4 matrices are equal.
     * @param {Float32Array} m1 The first 4x4 matrix.
     * @param {Float32Array} m2 The second 4x4 matrix.
     * @returns {Boolean}
     */
    mat.equal4 = function (m1, m2) {
        return (
              m1[0] === m2[0] &&
              m1[1] === m2[1] &&
              m1[2] === m2[2] &&
              m1[3] === m2[3] &&
              m1[4] === m2[4] &&
              m1[5] === m2[5] &&
              m1[6] === m2[6] &&
              m1[7] === m2[7] &&
              m1[8] === m2[8] &&
              m1[9] === m2[9] &&
              m1[10] === m2[10] &&
              m1[11] === m2[11] &&
              m1[12] === m2[12] &&
              m1[13] === m2[13] &&
              m1[14] === m2[14] &&
              m1[15] === m2[15]
              );
    };

    /**
     * Returns the sum of two 4x4 matrices.
     * @param {Float32Array} m1 The first 4x4 matrix.
     * @param {Float32Array} m2 The second 4x4 matrix.
     * @returns {Float32Array} The result 4x4 matrix.
     */
    mat.add4 = function (m1, m2) {
        return new Float32Array([
            m1[0] + m2[0], m1[1] + m2[1], m1[2] + m2[2], m1[3] + m2[3],
            m1[4] + m2[4], m1[5] + m2[5], m1[6] + m2[6], m1[7] + m2[7],
            m1[8] + m2[8], m1[9] + m2[9], m1[10] + m2[10], m1[11] + m2[11],
            m1[12] + m2[12], m1[13] + m2[13], m1[14] + m2[14], m1[15] + m2[15]
        ]);
    };

    /**
     * Multiplies two 3x3 matrices.
     * @param {Float32Array} m1 The 3x3 matrix on the left of the multiplicaton.
     * @param {Float32Array} m2 The 3x3 matrix on the right of the multiplicaton.
     * @returns {Float32Array} The result 3x3 matrix.
     */
    mat.mul3 = function (m1, m2) {
        return new Float32Array([
            m1[0] * m2[0] + m1[1] * m2[3] + m1[2] * m2[6],
            m1[0] * m2[1] + m1[1] * m2[4] + m1[2] * m2[7],
            m1[0] * m2[2] + m1[1] * m2[5] + m1[2] * m2[8],
            m1[3] * m2[0] + m1[4] * m2[3] + m1[5] * m2[6],
            m1[3] * m2[1] + m1[4] * m2[4] + m1[5] * m2[7],
            m1[3] * m2[2] + m1[4] * m2[5] + m1[5] * m2[8],
            m1[6] * m2[0] + m1[7] * m2[3] + m1[8] * m2[6],
            m1[6] * m2[1] + m1[7] * m2[4] + m1[8] * m2[7],
            m1[6] * m2[2] + m1[7] * m2[5] + m1[8] * m2[8]
        ]);
    };

    /**
     * Multiplies two 4x4 matrices.
     * @param {Float32Array} m1 The 4x4 matrix on the left of the multiplicaton.
     * @param {Float32Array} m2 The 4x4 matrix on the right of the multiplicaton.
     * @returns {Float32Array} The result 4x4 matrix.
     */
    mat.mul4 = function (m1, m2) {
        return new Float32Array([
            m1[0] * m2[0] + m1[1] * m2[4] + m1[2] * m2[8] + m1[3] * m2[12],
            m1[0] * m2[1] + m1[1] * m2[5] + m1[2] * m2[9] + m1[3] * m2[13],
            m1[0] * m2[2] + m1[1] * m2[6] + m1[2] * m2[10] + m1[3] * m2[14],
            m1[0] * m2[3] + m1[1] * m2[7] + m1[2] * m2[11] + m1[3] * m2[15],
            m1[4] * m2[0] + m1[5] * m2[4] + m1[6] * m2[8] + m1[7] * m2[12],
            m1[4] * m2[1] + m1[5] * m2[5] + m1[6] * m2[9] + m1[7] * m2[13],
            m1[4] * m2[2] + m1[5] * m2[6] + m1[6] * m2[10] + m1[7] * m2[14],
            m1[4] * m2[3] + m1[5] * m2[7] + m1[6] * m2[11] + m1[7] * m2[15],
            m1[8] * m2[0] + m1[9] * m2[4] + m1[10] * m2[8] + m1[11] * m2[12],
            m1[8] * m2[1] + m1[9] * m2[5] + m1[10] * m2[9] + m1[11] * m2[13],
            m1[8] * m2[2] + m1[9] * m2[6] + m1[10] * m2[10] + m1[11] * m2[14],
            m1[8] * m2[3] + m1[9] * m2[7] + m1[10] * m2[11] + m1[11] * m2[15],
            m1[12] * m2[0] + m1[13] * m2[4] + m1[14] * m2[8] + m1[15] * m2[12],
            m1[12] * m2[1] + m1[13] * m2[5] + m1[14] * m2[9] + m1[15] * m2[13],
            m1[12] * m2[2] + m1[13] * m2[6] + m1[14] * m2[10] + m1[15] * m2[14],
            m1[12] * m2[3] + m1[13] * m2[7] + m1[14] * m2[11] + m1[15] * m2[15]
        ]);
    };

    /**
     * Returns a 4x4 transformation matrix, which is the result of translating m1
     * by the translation described by m2.
     * @param {Float32Array} m1 A 4x4 transformation matrix.
     * @param {Float32Array} m2 A 4x4 transformation matrix. Only the translation
     * described in this matrix will be taken into account.
     * @returns {Float32Array}
     */
    mat.translatedByM4 = function (m1, m2) {
        return new Float32Array([
            m1[0], m1[1], m1[2], m1[3],
            m1[4], m1[5], m1[6], m1[7],
            m1[8], m1[9], m1[10], m1[11],
            m1[12] + m2[12], m1[13] + m2[13], m1[14] + m2[14], m1[15]
        ]);
    };

    /**
     * Returns the square of the distance between the translations described by the
     * two given 4x4 transformation matrices. Transformations other than translations
     * are ignored.
     * @param {Float32Array} m1 A 4x4 transformation matrix.
     * @param {Float32Array} m2 Another 4x4 transformation matrix.
     * @returns {Number}
     */
    mat.distanceSquared = function (m1, m2) {
        return (
              (m1[12] - m2[12]) * (m1[12] - m2[12]) +
              (m1[13] - m2[13]) * (m1[13] - m2[13]) +
              (m1[14] - m2[14]) * (m1[14] - m2[14])
              );
    };

    return mat;
});