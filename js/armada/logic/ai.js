/**
 * Copyright 2016 Krisztián Nagy
 * @file A stateful module providing a collection to which AIs of different types (at the moment only one type, an AI for fighters) can be
 * added which control their respective spacecraft when the control function of the module is called.
 * @author Krisztián Nagy [nkrisztian89@gmail.com]
 * @licence GNU GPLv3 <http://www.gnu.org/licenses/>
 * @version 0.1
 */

/*jslint nomen: true, white: true, plusplus: true */
/*global define */

/**
 * @param vec Used for vector operations the AIs need to calculate their actions.
 * @param mat Used for matrix operations the AIs need to calculate their actions.
 * @param physics Used for accessing the constant of how long rotation does a rotation matrix represent.
 * @param config Used for accessing game configuration/settings.
 * @param classes used for accessing spacecraft turn style enum type
 */
define([
    "utils/vectors",
    "utils/matrices",
    "modules/physics",
    "armada/configuration",
    "armada/classes"
], function (vec, mat, physics, config, classes) {
    "use strict";
    var
            // ------------------------------------------------------------------------------
            // enums
            /**
             * @enum {Number}
             * The possible phases of the charge action of fighters.
             */
            ChargePhase = {
                /**
                 * The phase when the fighter is not performing a charge action.
                 */
                NONE: -1,
                /**
                 * The phase when the fighter is charging at its target with increased speed.
                 */
                APPROACH_ATTACK: 0,
                /**
                 * The phase when the fighter is evading its target to avoid collision and heads towards a destination beyond it.
                 */
                EVADE: 1
            },
    // ------------------------------------------------------------------------------
    // constants
    /**
     * The type identifier to be used when creating fighter AIs.
     * @type String
     */
    FIGHTER_AI_NAME = "fighter",
            /**
             * The type identifier to be used when creating ship AIs.
             * @type String
             */
            SHIP_AI_NAME = "ship",
            /**
             * Spacecrafts will stop turning towards the specified direction when reaching this angle (in radians).
             * @type Number
             */
            TURN_THRESHOLD_ANGLE = 0.001,
            /**
             * The factor to apply when converting angular velocity (turning) matrix angles to rad / s.
             * @type Number
             */
            ANGULAR_VELOCITY_CONVERSION_FACTOR = 1000 / physics.ANGULAR_VELOCITY_MATRIX_DURATION,
            /**
             * Both yaw and pitch needs to be below this angle to consider a fighter facing its target. (in radians)
             * @type Number
             */
            TARGET_FACING_ANGLE_THRESHOLD = Math.radians(45),
            /**
             * When starting a new attack run, fighters will approach their targets to at least the distance that is their weapon range
             * multiplied by this factor.
             * @type Number
             */
            BASE_MAX_DISTANCE_FACTOR = 0.3,
            /**
             * When closing in on a target because of having difficulties hitting it at the current distance, the maximum approach distance 
             * factor will be decreased to this value maximum (gradually).
             * @type Number
             */
            CLOSE_MAX_DISTANCE_FACTOR = 0.125,
            /**
             * When closing in on a target because of having difficulties hitting it at the current distance, the maximum approach distance 
             * is decreased this much in one step.
             * @type Number
             */
            MAX_DISTANCE_FACTOR_DECREMENT = 0.05,
            /**
             * The maximum approach ditance factor will be decreased by one step (decrement) after this many missed shots at the target.
             * @type Number
             */
            CLOSE_IN_TRIGGER_MISS_COUNT = 5,
            /**
             * During normal (not charge) attacks, fighters will keep a distance of at least its weapon range multiplied by this factor
             * from the target.
             * @type Number
             */
            MIN_DISTANCE_FACTOR = 0.06,
            /**
             * Fighters will start evasive maneuvers if their current target fires at them from a distance farther than their range 
             * multiplied by this number.
             * @type Number
             */
            MIN_EVADE_DISTANCE_FACTOR = 0.5,
            /**
             * During normal (not charge) attacks, fighters will approach / back off with a maximum speed equal to their acceleration
             * multiplied by this factor.
             * @type Number
             */
            APPROACH_SPEED_FACTOR = 4,
            /**
             * During charge attacks, fighters will approach / evade with a maximum speed equal to their acceleration multiplied by this 
             * factor.
             * @type Number
             */
            CHARGE_SPEED_FACTOR = 6,
            /**
             * Fighters will initiate a charge attack if they are unable to hit their target after firing this many shots at it.
             * @type Number
             */
            CHARGE_TRIGGER_MISS_COUNT = 15,
            /**
             * Fighters will initiate a charge attack if they are hit by spacecrafts other than their current target this many times.
             * @type Number
             */
            CHARGE_TRIGGER_HIT_COUNT = 4,
            /**
             * When strafing to avoid a spacecraft blocking the current firing path, fighters will strafe (along each axis) with a maximum
             * speed equal to their acceleration multiplied by this factor.
             * @type Number
             */
            BLOCK_AVOIDANCE_SPEED_FACTOR = 1,
            /**
             * Fighters will open fire if they are able to aim within an angle under which an object of the size of their target multiplied
             * by this factor is visible at the current target distance.
             * @type Number
             */
            FIRE_THRESHOLD_ANGLE_FACTOR = 0.25,
            /**
             * Fighters will initiate a rolling maneuver after missing their target for this many shots.
             * @type Number
             */
            ROLL_CORRECTION_TRIGGERING_MISS_COUNT = 3,
            /**
             * Fighters will roll this much during one roll correction maneuver (in radians).
             * @type Number
             */
            ROLL_CORRECTION_ANGLE = Math.radians(45),
            /**
             * The distance within which a spacecraft has to be from a certain place (destination vector) to be considered being at that 
             * place, in meters.
             * @type Number
             */
            EXACT_PLACE_RANGE = 1,
            /**
             * When charge attacking, fighters will start the evade maneuver after reaching a critical distance, with an evade vector that
             * is 45 degrees from the attack vector and has a length of the critical distance multiplied by this factor.
             * @type Number
             */
            CHARGE_EVADE_VECTOR_LENGTH_FACTOR = 1,
            /**
             * When performing evasive maneuvers, fighters will strafe with a maximum speed equal to their acceleration mutliplied by this
             * factor.
             * @type Number
             */
            EVASIVE_MANEUVER_SPEED_FACTOR = 1,
            /**
             * Fighters will perform one evasive maneuver for this long, in milliseconds.
             * @type Number
             */
            EVASIVE_MANEUVER_DURATION = 1000,
            /**
             * When attacking an enemy, ships will approach their targets to at least the distance that is their weapon range
             * multiplied by this factor.
             * @type Number
             */
            SHIP_MAX_DISTANCE_FACTOR = 0.9,
            // ------------------------------------------------------------------------------
            // private variables
            /**
             * Cached value of the configuration setting determining for maximum how long should spacecrafts accelerate their turning, in
             * seconds.
             * @type Number
             */
            _turnAccelerationDuration = 0,
            /**
             * Cached value of the constant part of the expression calculating the intensity for turning (yawing and pitching), that only 
             * depends on constant configuration values.
             * @type Number
             */
            _turnIntensityBaseFactor = 0,
            /**
             * An associative array storing the constructors for the various types of AI by the string identifiers of the types.
             * @type Object
             */
            _aiConstructors,
            /**
             * The default AI context (storing the actual AIs) the methods of which are exposed by this module.
             * @type AIContext
             */
            _context;
    // ##############################################################################
    /**
     * @class
     * An abstract AI class that provides some generally useful methods for controlling a spacecraft.
     * @param {Spacecraft} spacecraft The AI will control this spacecraft.
     */
    function SpacecraftAI(spacecraft) {
        /**
         * The spacecraft this AI is controlling.
         * @type Spacecraft
         */
        this._spacecraft = spacecraft;
        /**
         * Cached value of the range of the first weapon of the controlled spacecraft (at still position).
         * @type Number
         */
        this._weaponRange = (this._spacecraft && (this._spacecraft.getWeapons().length > 0)) ? this._spacecraft.getWeapons()[0].getRange() : 0;
    }
    /**
     * Controls the spacecraft to turn (yaw and pitch) in the desired direction specified by two angles.
     * @param {Number} yaw The yaw angle of the direction to turn towards, with a positive number meaning a direction to the left, in radians.
     * @param {Number} pitch The pitch angle of the direction to turn towards, with a positive number meaning a direction upwards, in radians.
     * @param {Number} dt The time passed since the last turn command in milliseconds - for an estimation of the time the set yaw and pitch 
     * angular velocity will be in effect, so that they can be limited to avoid overshooting the desired angles
     */
    SpacecraftAI.prototype.turn = function (yaw, pitch, dt) {
        var turningMatrix, angularVelocity, angularAcceleration, turnStopAngle, turnIntensityFactor;
        turningMatrix = this._spacecraft.getTurningMatrix();
        angularAcceleration = this._spacecraft.getMaxAngularAcceleration();
        // a turn intensity of 1 means to accelerate the angular velocity to TURN_ACCELERATION_DURATION_S * acceleration (in rad / sec) and
        // lower values represent a linear portion of this intended angular velocity
        // the base intensity factor converts dt to seconds and counts in TURN_ACCELERATION_DURATION_S
        // based on angle = angular velocity * time, we choose an angular velocity that will not overshoot the intended angle in the next dt
        // milliseconds (which will mean about the next simulation step with relatively stable framerates)
        turnIntensityFactor = _turnIntensityBaseFactor / (angularAcceleration * dt);
        // calculating how much will the spacecraft turn at the current angular velocity if it starts decelerating right now
        angularVelocity = Math.sign(turningMatrix[4]) * vec.angle2u([0, 1], vec.normal2([turningMatrix[4], turningMatrix[5]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (yaw > turnStopAngle) {
            this._spacecraft.yawLeft(Math.min(Math.max(0, turnIntensityFactor * (yaw - turnStopAngle)), 1));
        } else if (yaw < -turnStopAngle) {
            this._spacecraft.yawRight(Math.min(Math.max(0, turnIntensityFactor * (-yaw - turnStopAngle)), 1));
        }
        angularVelocity = Math.sign(turningMatrix[6]) * vec.angle2u([1, 0], vec.normal2([turningMatrix[5], turningMatrix[6]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (pitch > turnStopAngle) {
            this._spacecraft.pitchUp(Math.min(Math.max(0, turnIntensityFactor * (pitch - turnStopAngle)), 1));
        } else if (pitch < -turnStopAngle) {
            this._spacecraft.pitchDown(Math.min(Math.max(0, turnIntensityFactor * (-pitch - turnStopAngle)), 1));
        }
    };
    /**
     * Controls the spacecraft to turn (roll and yaw) in the desired direction specified by two angles.
     * @param {Number} roll The roll angle of the direction to turn towards
     * @param {Number} yaw The yaw angle of the direction to turn towards
     * @param {Number} dt The time passed since the last turn command in milliseconds - for an estimation of the time the set yaw and pitch 
     * angular velocity will be in effect, so that they can be limited to avoid overshooting the desired angles
     */
    SpacecraftAI.prototype.rollAndYaw = function (roll, yaw, dt) {
        var turningMatrix, angularVelocity, angularAcceleration, turnStopAngle, turnIntensityFactor;
        turningMatrix = this._spacecraft.getTurningMatrix();
        angularAcceleration = this._spacecraft.getMaxAngularAcceleration();
        // a turn intensity of 1 means to accelerate the angular velocity to TURN_ACCELERATION_DURATION_S * acceleration (in rad / sec) and
        // lower values represent a linear portion of this intended angular velocity
        // the base intensity factor converts dt to seconds and counts in TURN_ACCELERATION_DURATION_S
        // based on angle = angular velocity * time, we choose an angular velocity that will not overshoot the intended angle in the next dt
        // milliseconds (which will mean about the next simulation step with relatively stable framerates)
        turnIntensityFactor = _turnIntensityBaseFactor / (angularAcceleration * dt);
        // calculating how much will the spacecraft turn at the current angular velocity if it starts decelerating right now
        angularVelocity = Math.sign(turningMatrix[2]) * vec.angle2u([1, 0], vec.normal2([turningMatrix[0], turningMatrix[2]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (roll > turnStopAngle) {
            this._spacecraft.rollLeft(Math.min(Math.max(0, turnIntensityFactor * (roll - turnStopAngle)), 1));
        } else if (roll < -turnStopAngle) {
            this._spacecraft.rollRight(Math.min(Math.max(0, turnIntensityFactor * (-roll - turnStopAngle)), 1));
        }
        angularVelocity = Math.sign(turningMatrix[4]) * vec.angle2u([0, 1], vec.normal2([turningMatrix[4], turningMatrix[5]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (yaw > turnStopAngle) {
            this._spacecraft.yawLeft(Math.min(Math.max(0, turnIntensityFactor * (yaw - turnStopAngle)), 1));
        } else if (yaw < -turnStopAngle) {
            this._spacecraft.yawRight(Math.min(Math.max(0, turnIntensityFactor * (-yaw - turnStopAngle)), 1));
        }
    };
    /**
     * Controls the spacecraft to turn (roll and pitch) in the desired direction specified by two angles.
     * @param {Number} roll The roll angle of the direction to turn towards
     * @param {Number} pitch The pitch angle of the direction to turn towards
     * @param {Number} dt The time passed since the last turn command in milliseconds - for an estimation of the time the set yaw and pitch 
     * angular velocity will be in effect, so that they can be limited to avoid overshooting the desired angles
     */
    SpacecraftAI.prototype.rollAndPitch = function (roll, pitch, dt) {
        var turningMatrix, angularVelocity, angularAcceleration, turnStopAngle, turnIntensityFactor;
        turningMatrix = this._spacecraft.getTurningMatrix();
        angularAcceleration = this._spacecraft.getMaxAngularAcceleration();
        turnIntensityFactor = _turnIntensityBaseFactor / (angularAcceleration * dt);
        angularVelocity = Math.sign(turningMatrix[2]) * vec.angle2u([1, 0], vec.normal2([turningMatrix[0], turningMatrix[2]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (roll > turnStopAngle) {
            this._spacecraft.rollLeft(Math.min(Math.max(0, turnIntensityFactor * (roll - turnStopAngle)), 1));
        } else if (roll < -turnStopAngle) {
            this._spacecraft.rollRight(Math.min(Math.max(0, turnIntensityFactor * (-roll - turnStopAngle)), 1));
        }
        angularVelocity = Math.sign(turningMatrix[6]) * vec.angle2u([1, 0], vec.normal2([turningMatrix[5], turningMatrix[6]])) * ANGULAR_VELOCITY_CONVERSION_FACTOR;
        turnStopAngle = Math.max(angularVelocity * angularVelocity / (2 * angularAcceleration), TURN_THRESHOLD_ANGLE);
        if (pitch > turnStopAngle) {
            this._spacecraft.pitchUp(Math.min(Math.max(0, turnIntensityFactor * (pitch - turnStopAngle)), 1));
        } else if (pitch < -turnStopAngle) {
            this._spacecraft.pitchDown(Math.min(Math.max(0, turnIntensityFactor * (-pitch - turnStopAngle)), 1));
        }
    };
    /**
     * Can be used to set an appropriate forward / reverse speed for the controlled spacecraft so that its distance from a target it is
     * pointing towards is within a desired range.
     * @param {Number} currentDistance The distance from the target to approach (the spacecraft must be pointing towards this target, at least roughly)
     * @param {Number} maxDistance The upper limit of the desired distance from the target. If the spacecraft is farther, it will close in. (move forward)
     * @param {Number} minDistance The lower limit of the desired distance from the target. If the spacecraft is closer, it will back off. (move backward)
     * @param {Number} maxSpeed The maximum forward/reverse speed to use when closing in / backing off.
     */
    SpacecraftAI.prototype.approach = function (currentDistance, maxDistance, minDistance, maxSpeed) {
        var speed, stopDistance;
        speed = this._spacecraft.getRelativeVelocityMatrix()[13];
        // calculate the distance the spacecraft will travel if we reset the speed to zero right away so that we can start slowing down in time
        stopDistance = speed * speed / (2 * this._spacecraft.getMaxAcceleration());
        if (speed < 0) {
            stopDistance = -stopDistance;
        }
        if (currentDistance - stopDistance > maxDistance) {
            this._spacecraft.setSpeedTarget(maxSpeed);
        } else if ((minDistance >= 0) && (currentDistance - stopDistance < minDistance)) {
            this._spacecraft.setSpeedTarget(-maxSpeed);
        } else {
            this._spacecraft.resetSpeed();
        }
    };
    // ##############################################################################
    /**
     * @class
     * @extends SpacecraftAI
     * An AI that is suitable to control a fighter - that is a spacecraft with the assumptions that it is small, maneuverable and has its
     * guns pointing forward, requiring it to face its target when firing.
     * @param {Spacecraft} fighter The fighter to control
     */
    function FighterAI(fighter) {
        SpacecraftAI.call(this, fighter);
        /**
         * The time elapsed since finishing the last roll movement while firing (reset when not firing or when a new attack run starts), in 
         * milliseconds.
         * @type Number
         */
        this._timeSinceLastRoll = 0;
        /**
         * The time elapsed since last hitting the current target while firing (reset when not facing the target or when a new attack run 
         * starts), in milliseconds.
         * @type Number
         */
        this._timeSinceLastTargetHit = 0;
        /**
         * The time elapsed since last closing in (decreasing the approach distance by one decrement) while firing (reset when not facing 
         * the target or when a new attack run starts), in milliseconds.
         * @type Number
         */
        this._timeSinceLastClosingIn = 0;
        /**
         * The number of hits suffered from ships that are not the current target while facing the current target (reset when not facing the
         * target or when a new attack run starts)
         * @type Number
         */
        this._hitCountByNonTarget = 0;
        /**
         * The time elapsed since the current evasive maneuver started, in milliseconds, or -1 if there is no evasive maneuver in progress.
         * @type Number
         */
        this._evasiveManeuverTime = -1;
        /**
         * The 2D vector describing the strafing velocity (horizontal and vertical) with which the current evasive maneuver should be 
         * carried out.
         * @type Number
         */
        this._evasiveVelocityVector = [0, 0];
        /**
         * The time elapsed since the start of the current roll maneuver in milliseconds, or -1 if the fighter is not rolling currently.
         * @type Number
         */
        this._rollTime = -1;
        /**
         * The current phase of the charge maneuver the fighter is performing. (enum ChargePhase)
         * @type Number
         */
        this._chargePhase = ChargePhase.NONE;
        /**
         * The 3D vector describing the world-space position of the destination point where the fighter should head to during the evade 
         * phase of the charge maneuver. (in meters)
         * @type Number
         */
        this._chargeDestination = [0, 0, 0];
        /**
         * When peforming a normal (not charge) attack, the fighter will approach its target to be at a maximum distance which equals the
         * range of its weapons multiplied by this factor. This starts out at a base value and is decreased gradually if the fighter 
         * cannot hit its target at the current distance.
         * @type Number
         */
        this._maxDistanceFactor = BASE_MAX_DISTANCE_FACTOR;
        /**
         * If the firing path of the fighter is blocked by another spacecraft, a reference of that spacecraft is stored in this variable
         * so that a detailed check about whether the blocking still persists can be performed for this specific craft (but doesn't need
         * to be performed for other spacecrafts). It is null if the firing path isn't blocked.
         * @type Spacecraft|null
         */
        this._isBlockedBy = null;
        /**
         * Cached value of whether the controlled spacecraft is currently facing its target.
         * @type Boolean
         */
        this._facingTarget = false;
        /**
         * Cached value of the distance to the current target of the controled spacecraft.
         * @type Boolean
         */
        this._targetDistance = 0;
        // attaching handlers to the various spacecraft events
        this._spacecraft.setOnBeingHit(this._handleBeingHit.bind(this));
        this._spacecraft.setOnTargetHit(this._handleTargetHit.bind(this));
        this._spacecraft.setOnAnySpacecraftHit(this._handleAnySpacecraftHit.bind(this));
        this._spacecraft.setOnTargetFired(this._handleTargetFired.bind(this));
    }
    FighterAI.prototype = new SpacecraftAI();
    FighterAI.prototype.constructor = FighterAI;
    /**
     * Sets up the state of the AI to perform a new attack run, to be used when switching to a new target or after a charge maneuver has 
     * been finished. The approach distance, attack path blocking state and triggers for charge, close-in, roll are reset. Does not cancel
     * in progress evasive maneuvers.
     */
    FighterAI.prototype._startNewAttackRun = function () {
        this._chargePhase = ChargePhase.NONE;
        this._hitCountByNonTarget = 0;
        this._timeSinceLastTargetHit = 0;
        this._timeSinceLastClosingIn = 0;
        this._timeSinceLastRoll = 0;
        this._maxDistanceFactor = BASE_MAX_DISTANCE_FACTOR;
        this._isBlockedBy = null;
        this._rollTime = -1;
    };
    /**
     * Updates the AI state in case a new target has been selected by the fighter.
     */
    FighterAI.prototype._handleTargetSwitch = function () {
        this._startNewAttackRun();
    };
    /**
     * Updates the AI state for when the fighter has been hit.
     * @param {Spacecraft} spacecraft The spacecraft that fired the projectile which hit the controlled fighter.
     * @param {Number[3]} hitPosition The relative position where the projectile has hit the controlled fighter (in object-space)
     */
    FighterAI.prototype._handleBeingHit = function (spacecraft, hitPosition) {
        // initiating a new evasive maneuver in case one is not already in progress
        // if the attack path is blocked by a spacecraft, then we are already strafing, so no evasive maneuver is started
        if (!this._isBlockedBy && (this._evasiveManeuverTime < 0)) {
            this._evasiveManeuverTime = 0;
            // marking the direction opposite to the hit position so an appropriate evasive vector can be calculated
            this._evasiveVelocityVector[0] = -hitPosition[0];
            this._evasiveVelocityVector[1] = -hitPosition[2];
            vec.normalize2(this._evasiveVelocityVector);
        }
        // if being hit by a (still alive) hostile ship while having different target
        if (this._spacecraft && !this._spacecraft.canBeReused() && !spacecraft.canBeReused() && spacecraft.isHostile(this._spacecraft) && this._spacecraft.getTarget() && (this._spacecraft.getTarget() !== spacecraft)) {
            // switch target in case the current target is not targeting us anyway
            if (this._spacecraft.getTarget().getTarget() !== this._spacecraft) {
                this._spacecraft.setTarget(spacecraft);
                this._handleTargetSwitch();
            }
            this._hitCountByNonTarget++;
        }
    };
    /**
     * Updates the AI state for when the controlled fighter has successfully hit its current target.
     */
    FighterAI.prototype._handleTargetHit = function () {
        this._timeSinceLastTargetHit = 0;
    };
    /**
     * Updates the AI state for when the controlled fighter has hit any spacecraft (including itself and its current target)
     * @param {Spacecraft} spacecraft The spacecraft that has been hit.
     */
    FighterAI.prototype._handleAnySpacecraftHit = function (spacecraft) {
        // if a spacecraft other than the controlled one or the current target is hit while performing either a normal or charge attack
        // (but not evading) we mark the hit spacecraft as blocking the firing path, triggering blocker avoidance strafing maneuvers
        // if a blocking spacecraft is already mark, we overwrite it only if it is hostile, as the new one might be friendly, which means
        // we should not continue firing until the path is clear again
        if (this._spacecraft && !this._spacecraft.canBeReused() && (spacecraft !== this._spacecraft) && (this._chargePhase !== ChargePhase.EVADE) && (spacecraft !== this._spacecraft.getTarget()) && (!this._isBlockedBy || (this._isBlockedBy.isHostile(this._spacecraft)))) {
            this._isBlockedBy = spacecraft;
            // block avoidance controls strafing just like evasive maneuvers, therefore both cannot be active at the same time
            this._evasiveManeuverTime = -1;
            // charge attacks are canceled so we do not run into the blocking spacecraft
            this._chargePhase = ChargePhase.NONE;
        }
    };
    /**
     * Updates the AI state for when the current target of the controlled spacecraft fires.
     */
    FighterAI.prototype._handleTargetFired = function () {
        var angle;
        // if we see the current target firing at us, start a random evasive maneuver
        if (!this._isBlockedBy && (this._evasiveManeuverTime < 0) &&
                this._facingTarget && this._spacecraft && this._spacecraft.getTarget() && (this._spacecraft.getTarget().getTarget() === this._spacecraft) &&
                (this._targetDistance > this._weaponRange * MIN_EVADE_DISTANCE_FACTOR)) {
            this._evasiveManeuverTime = 0;
            angle = Math.random() * 2 * Math.PI;
            this._evasiveVelocityVector[0] = 1;
            this._evasiveVelocityVector[1] = 0;
            vec.rotate2(this._evasiveVelocityVector, angle);
        }
    };
    /**
     * Updates the AI state for the case when the battle scene with all objects has been moved by a vector, updating stored world-space
     * positions.
     * @param {Number[3]} vector
     */
    FighterAI.prototype.handleSceneMoved = function (vector) {
        vec.add3(this._chargeDestination, vector);
    };
    /**
     * Performs all spacecraft controlling actions (turning, rolling, targeting, firing, strafing, setting speed etc) based on the current
     * state of the AI and updates the state accordingly. Should be called once in every battle simulation step.
     * @param {Number} dt The time elapsed since the last control step, in milliseconds.
     */
    FighterAI.prototype.control = function (dt) {
        var
                /** @type Spacecraft */
                target,
                /** @type Number[3] */
                positionVector, targetPositionVector, vectorToTarget,
                directionToTarget, relativeTargetDirection, relativeBlockerPosition,
                /** @type Number */
                targetHitTime,
                ownSize, targetSize,
                fireThresholdAngle,
                acceleration, minDistance, maxDistance, speed, blockAvoidanceSpeed, baseDistance,
                weaponCooldown,
                rollDuration, rollWaitTime,
                angularAcceleration, maxAngularVelocity,
                worldProjectileVelocity,
                closeInTriggerTime,
                /** @type Object */
                targetYawAndPitch,
                /** @type Boolean */
                stillBlocked, strafingHandled,
                /** @type Array */
                weapons,
                /** @type Float32Array */
                inverseOrientationMatrix;
        // only perform anything if the controlled spacecraft still exists
        if (this._spacecraft) {
            // if the controlled spacecraft has been destroyed, remove the reference
            if (this._spacecraft.canBeReused()) {
                this._spacecraft = null;
                return;
            }
            // .................................................................................................
            // state setup
            strafingHandled = false;
            // .................................................................................................
            // targeting
            if (!this._spacecraft.getTarget()) {
                this._spacecraft.targetNextHostile();
                this._handleTargetSwitch();
            }
            // .................................................................................................
            // caching / referencing commonly needed variables
            acceleration = this._spacecraft.getMaxAcceleration();
            ownSize = this._spacecraft.getVisualModel().getScaledSize();
            // caching / referencing needed variables
            positionVector = mat.translationVector3(this._spacecraft.getPhysicalPositionMatrix());
            inverseOrientationMatrix = mat.inverseOfRotation4(this._spacecraft.getPhysicalOrientationMatrix());
            speed = this._spacecraft.getRelativeVelocityMatrix()[13];
            target = this._spacecraft.getTarget();
            // .................................................................................................
            // evade phase of charge maneuver
            if (this._chargePhase === ChargePhase.EVADE) {
                vectorToTarget = vec.diff3(this._chargeDestination, positionVector);
                relativeTargetDirection = vec.mulVec3Mat4(
                        vectorToTarget,
                        inverseOrientationMatrix);
                this._targetDistance = vec.length3(relativeTargetDirection);
                vec.normalize3(relativeTargetDirection);
                targetYawAndPitch = vec.getYawAndPitch(relativeTargetDirection);
                this.turn(targetYawAndPitch.yaw, targetYawAndPitch.pitch, dt);
                this._spacecraft.setSpeedTarget(acceleration * CHARGE_SPEED_FACTOR);
                if ((this._targetDistance <= EXACT_PLACE_RANGE) || (relativeTargetDirection[1] < 0) || (speed < 0)) {
                    this._startNewAttackRun();
                }
                // .................................................................................................
                // attacking current target
            } else if (target) {
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // in any other case, setting up variables
                targetPositionVector = mat.translationVector3(target.getPhysicalPositionMatrix());
                vectorToTarget = vec.diff3(targetPositionVector, positionVector);
                relativeTargetDirection = vec.mulVec3Mat4(
                        vectorToTarget,
                        inverseOrientationMatrix);
                this._targetDistance = vec.length3(relativeTargetDirection);
                vec.normalize3(relativeTargetDirection);
                targetYawAndPitch = vec.getYawAndPitch(relativeTargetDirection);
                this._facingTarget = (Math.abs(targetYawAndPitch.yaw) < TARGET_FACING_ANGLE_THRESHOLD) && (Math.abs(targetYawAndPitch.pitch) < TARGET_FACING_ANGLE_THRESHOLD);
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // turning towards target
                this.turn(targetYawAndPitch.yaw, targetYawAndPitch.pitch, dt);
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // handling if another spacecraft blocks the attack path
                if (this._isBlockedBy) {
                    stillBlocked = false;
                    if (!this._isBlockedBy.canBeReused() && this._facingTarget) {
                        // checking if the blocking spacecraft is still in the way
                        if (this._isBlockedBy.getPhysicalModel().checkHit(targetPositionVector, vectorToTarget, 1000, ownSize / 2)) {
                            relativeBlockerPosition = vec.mulVec3Mat4(
                                    vec.diff3(
                                            mat.translationVector3(this._isBlockedBy.getPhysicalPositionMatrix()),
                                            positionVector),
                                    inverseOrientationMatrix);
                            blockAvoidanceSpeed = acceleration * BLOCK_AVOIDANCE_SPEED_FACTOR;
                            if (relativeBlockerPosition[0] < 0) {
                                this._spacecraft.strafeRight(blockAvoidanceSpeed);
                                stillBlocked = true;
                            } else {
                                this._spacecraft.strafeLeft(blockAvoidanceSpeed);
                                stillBlocked = true;
                            }
                            if (relativeBlockerPosition[2] > 0) {
                                this._spacecraft.lower(blockAvoidanceSpeed);
                                stillBlocked = true;
                            } else {
                                this._spacecraft.raise(blockAvoidanceSpeed);
                                stillBlocked = true;
                            }
                        }
                    }
                    if (!stillBlocked) {
                        this._isBlockedBy = null;
                        this._spacecraft.stopLeftStrafe();
                        this._spacecraft.stopRightStrafe();
                        this._spacecraft.stopLower();
                        this._spacecraft.stopRaise();
                    }
                    strafingHandled = true;
                }
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // actions based on weapons
                weapons = this._spacecraft.getWeapons();
                if (weapons && weapons.length > 0) {
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // firing
                    targetSize = target.getVisualModel().getScaledSize();
                    fireThresholdAngle = Math.atan(FIRE_THRESHOLD_ANGLE_FACTOR * targetSize / this._targetDistance);
                    worldProjectileVelocity = weapons[0].getProjectileVelocity() + speed;
                    targetHitTime = this._targetDistance / worldProjectileVelocity * 1000;
                    weaponCooldown = weapons[0].getCooldown();
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // aiming turnable weapons towards target
                    this._spacecraft.aimWeapons(TURN_THRESHOLD_ANGLE, fireThresholdAngle, dt);
                    if (!this._facingTarget) {
                        this._timeSinceLastClosingIn = 0;
                        this._timeSinceLastTargetHit = 0;
                        this._hitCountByNonTarget = 0;
                    }
                    if ((vec.length3(vec.diff3(this._spacecraft.getTargetHitPosition(), positionVector)) <= weapons[0].getRange(speed)) &&
                            (Math.abs(targetYawAndPitch.yaw) < fireThresholdAngle) && (Math.abs(targetYawAndPitch.pitch) < fireThresholdAngle) &&
                            (!this._isBlockedBy || this._isBlockedBy.isHostile(this._spacecraft))) {
                        this._spacecraft.fire();
                        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                        // if we are not hitting the target despite not being blocked and firing in the right direction, roll the spacecraft
                        if (!this._isBlockedBy) {
                            this._timeSinceLastRoll += dt;
                            this._timeSinceLastTargetHit += dt;
                            this._timeSinceLastClosingIn += dt;
                            // starting roll if needed
                            rollWaitTime = targetHitTime + ROLL_CORRECTION_TRIGGERING_MISS_COUNT * weaponCooldown;
                            if ((this._timeSinceLastRoll > rollWaitTime) && (this._timeSinceLastTargetHit > rollWaitTime)) {
                                this._rollTime = 0;
                            }
                            // performing coll
                            if (this._rollTime >= 0) {
                                this._spacecraft.rollLeft();
                                this._timeSinceLastRoll = 0;
                                this._rollTime += dt;
                                // calculating the duration of rolling based on the angle we would like to roll (in seconds)
                                angularAcceleration = this._spacecraft.getMaxAngularAcceleration();
                                maxAngularVelocity = angularAcceleration * _turnAccelerationDuration;
                                rollDuration = (ROLL_CORRECTION_ANGLE > maxAngularVelocity * _turnAccelerationDuration) ?
                                        _turnAccelerationDuration + (ROLL_CORRECTION_ANGLE - (maxAngularVelocity * _turnAccelerationDuration)) / maxAngularVelocity :
                                        Math.sqrt(4 * ROLL_CORRECTION_ANGLE / angularAcceleration) / 2;
                                // stopping roll (converting to milliseconds)
                                if (this._rollTime > rollDuration * 1000) {
                                    this._rollTime = -1;
                                }
                            }
                        }
                    } else {
                        this._timeSinceLastRoll = 0;
                    }
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // initiating charge
                    if ((this._chargePhase === ChargePhase.NONE) && ((this._hitCountByNonTarget >= CHARGE_TRIGGER_HIT_COUNT) || ((this._timeSinceLastTargetHit > targetHitTime + CHARGE_TRIGGER_MISS_COUNT * weaponCooldown)))) {
                        this._chargePhase = ChargePhase.APPROACH_ATTACK;
                    }
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // managing distance from target based on weapons range
                    // normal (non-charging behaviour)
                    if (this._chargePhase === ChargePhase.NONE) {
                        // closing in the distance if we are unable to hit the target at the current range
                        closeInTriggerTime = targetHitTime + CLOSE_IN_TRIGGER_MISS_COUNT * weaponCooldown;
                        if ((this._timeSinceLastClosingIn > closeInTriggerTime) && (this._timeSinceLastTargetHit > closeInTriggerTime) && (this._maxDistanceFactor > CLOSE_MAX_DISTANCE_FACTOR)) {
                            this._maxDistanceFactor = Math.max(this._maxDistanceFactor - MAX_DISTANCE_FACTOR_DECREMENT, CLOSE_MAX_DISTANCE_FACTOR);
                            this._timeSinceLastClosingIn = 0;
                        }
                        baseDistance = 0.5 * (ownSize + targetSize);
                        maxDistance = baseDistance + this._maxDistanceFactor * this._weaponRange;
                        minDistance = baseDistance + MIN_DISTANCE_FACTOR * this._weaponRange;
                        if (!this._facingTarget) {
                            this._spacecraft.resetSpeed();
                        } else {
                            this.approach(this._targetDistance, maxDistance, minDistance, acceleration * APPROACH_SPEED_FACTOR);
                        }
                        // charge attack behaviour (closing in at higher speed, without slowing)
                    } else if (this._chargePhase === ChargePhase.APPROACH_ATTACK) {
                        // calculating the distance at which the spacecraft will be able to avoid collision at charge speed
                        maxDistance = Math.sqrt((targetSize + ownSize * 0.5) * 2 / acceleration) * acceleration * CHARGE_SPEED_FACTOR;
                        if (!this._facingTarget) {
                            this._spacecraft.resetSpeed();
                            this._chargePhase = ChargePhase.NONE;
                        } else {
                            this._spacecraft.setSpeedTarget(acceleration * CHARGE_SPEED_FACTOR);
                            // when the critical distance is reached, mark a destination beyond the target to head towards it
                            if (this._targetDistance <= maxDistance) {
                                this._chargePhase = ChargePhase.EVADE;
                                directionToTarget = vec.normal3(vectorToTarget);
                                this._chargeDestination = vec.sum3(
                                        positionVector,
                                        vec.scaled3(
                                                vec.diff3(
                                                        vec.sum3(
                                                                targetPositionVector,
                                                                vec.scaled3(vec.normal3(vec.mulVec3Mat4(vec.perpendicular3(directionToTarget), mat.rotation4(directionToTarget, Math.random() * Math.PI * 2))), maxDistance)),
                                                        positionVector),
                                                CHARGE_EVADE_VECTOR_LENGTH_FACTOR));
                            }
                        }
                    }
                } else {
                    this._spacecraft.resetSpeed();
                }
            } else {
                this._facingTarget = false;
                this._targetDistance = 0;
                this._spacecraft.resetSpeed();
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // aiming turnable weapons towards default position
                this._spacecraft.aimWeapons(TURN_THRESHOLD_ANGLE, 0, dt);
            }
            if (!strafingHandled) {
                // .................................................................................................
                // performing evasive maneuver when hit
                if (this._evasiveManeuverTime >= 0) {
                    // when initiating an evasive maneuver, the evasive velocity vector is a unit vector pointin in the opposite direction
                    // to where the spacecraft has been hit, so we scale it to the required speed and randomly rotate it -90 to +90 degrees
                    if (this._evasiveManeuverTime === 0) {
                        this._evasiveVelocityVector[0] *= acceleration * EVASIVE_MANEUVER_SPEED_FACTOR;
                        this._evasiveVelocityVector[1] *= acceleration * EVASIVE_MANEUVER_SPEED_FACTOR;
                        vec.rotate2(this._evasiveVelocityVector, (Math.random() - 0.5) * Math.PI);
                    }
                    // setting the appropriate strafing speeds
                    if (this._evasiveVelocityVector[0] > 0) {
                        this._spacecraft.strafeRight(this._evasiveVelocityVector[0]);
                    } else if (this._evasiveVelocityVector[0] < 0) {
                        this._spacecraft.strafeLeft(-this._evasiveVelocityVector[0]);
                    } else {
                        this._spacecraft.stopLeftStrafe();
                        this._spacecraft.stopRightStrafe();
                    }
                    if (this._evasiveVelocityVector[1] > 0) {
                        this._spacecraft.raise(this._evasiveVelocityVector[1]);
                    } else if (this._evasiveVelocityVector[1] < 0) {
                        this._spacecraft.lower(-this._evasiveVelocityVector[1]);
                    } else {
                        this._spacecraft.stopLower();
                        this._spacecraft.stopRaise();
                    }
                    this._evasiveManeuverTime += dt;
                    if (this._evasiveManeuverTime > EVASIVE_MANEUVER_DURATION) {
                        this._evasiveManeuverTime = -1;
                    }
                    // if no evasive maneuver is in progress and the firing path is not blocked, cancel all strafing
                } else {
                    this._spacecraft.stopLeftStrafe();
                    this._spacecraft.stopRightStrafe();
                    this._spacecraft.stopLower();
                    this._spacecraft.stopRaise();
                }
            }
        }
    };
    // ##############################################################################
    /**
     * @class
     * @extends SpacecraftAI
     * An AI that is suitable to control a ship - that is a spacecraft with the assumptions that it is larger, its weapons are rotatable,
     * it has an attack vector and threshold angle defined which determine the direction of the ship while attacking and it has a turning
     * style defined which governs how to orient itself to the proper direction.
     * @param {Spacecraft} ship the ship to control
     */
    function ShipAI(ship) {
        SpacecraftAI.call(this, ship);
        /**
         * Cached value of the result of the last calculation of whether the current target is in range.
         * @type Boolean
         */
        this._targetInRange = false;
        // attaching handlers to the various spacecraft events
        this._spacecraft.setOnBeingHit(this._handleBeingHit.bind(this));
    }
    ShipAI.prototype = new SpacecraftAI();
    ShipAI.prototype.constructor = ShipAI;
    /**
     * Updates the AI state for when the ship has been hit.
     * @param {Spacecraft} spacecraft The spacecraft that fired the projectile which hit the controlled ship.
     */
    ShipAI.prototype._handleBeingHit = function (spacecraft) {
        // if being hit by a (still alive) hostile ship while having different target
        if (this._spacecraft && !this._spacecraft.canBeReused() && !spacecraft.canBeReused() && spacecraft.isHostile(this._spacecraft) && this._spacecraft.getTarget() && (this._spacecraft.getTarget() !== spacecraft)) {
            // switch target in case the current target is not targeting us anyway or is out of range
            if ((this._spacecraft.getTarget().getTarget() !== this._spacecraft) || !this._targetInRange) {
                this._spacecraft.setTarget(spacecraft);
            }
        }
    };
    /**
     * Updates the AI state for the case when the battle scene with all objects has been moved by a vector, updating stored world-space
     * positions.
     */
    ShipAI.prototype.handleSceneMoved = function () {
        return;
    };
    /**
     * Performs all spacecraft controlling actions (turning, orienting, targeting, firing, setting speed etc) based on the current
     * state of the AI and updates the state accordingly. Should be called once in every battle simulation step.
     * @param {Number} dt The time elapsed since the last control step, in milliseconds.
     */
    ShipAI.prototype.control = function (dt) {
        var
                /** @type Spacecraft */
                target,
                /** @type Number[3] */
                positionVector, targetPositionVector, vectorToTarget,
                relativeTargetDirection,
                /** @type Number[2] */
                angles, angleDifference,
                /** @type Number */
                targetDistance,
                ownSize, targetSize, fireThresholdAngle,
                acceleration, maxDistance, baseDistance,
                thresholdAngle,
                /** @type Object */
                targetYawAndPitch, targetAngles,
                /** @type Boolean */
                facingTarget,
                /** @type Array */
                weapons,
                /** @type Float32Array */
                inverseOrientationMatrix;
        // only perform anything if the controlled spacecraft still exists
        if (this._spacecraft) {
            // if the controlled spacecraft has been destroyed, remove the reference
            if (this._spacecraft.canBeReused()) {
                this._spacecraft = null;
                return;
            }
            // .................................................................................................
            // targeting
            if (!this._spacecraft.getTarget()) {
                this._spacecraft.targetNextHostile();
            }
            // .................................................................................................
            // caching / referencing commonly needed variables
            acceleration = this._spacecraft.getMaxAcceleration();
            ownSize = this._spacecraft.getVisualModel().getScaledSize();
            // caching / referencing needed variables
            positionVector = mat.translationVector3(this._spacecraft.getPhysicalPositionMatrix());
            inverseOrientationMatrix = mat.inverseOfRotation4(this._spacecraft.getPhysicalOrientationMatrix());
            target = this._spacecraft.getTarget();
            this._targetInRange = false;
            if (target) {
                targetPositionVector = mat.translationVector3(target.getPhysicalPositionMatrix());
                vectorToTarget = vec.diff3(targetPositionVector, positionVector);
                relativeTargetDirection = vec.mulVec3Mat4(
                        vectorToTarget,
                        inverseOrientationMatrix);
                targetDistance = vec.length3(relativeTargetDirection);
                vec.normalize3(relativeTargetDirection);
                targetYawAndPitch = vec.getYawAndPitch(relativeTargetDirection);
                facingTarget = (Math.abs(targetYawAndPitch.yaw) < TARGET_FACING_ANGLE_THRESHOLD) && (Math.abs(targetYawAndPitch.pitch) < TARGET_FACING_ANGLE_THRESHOLD);
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // actions based on weapons
                weapons = this._spacecraft.getWeapons();
                if (weapons && weapons.length > 0) {
                    targetSize = target.getVisualModel().getScaledSize();
                    baseDistance = 0.25 * ownSize;
                    maxDistance = baseDistance + SHIP_MAX_DISTANCE_FACTOR * this._weaponRange;
                    fireThresholdAngle = Math.atan(FIRE_THRESHOLD_ANGLE_FACTOR * targetSize / targetDistance);
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // aiming turnable weapons towards target
                    this._spacecraft.aimWeapons(TURN_THRESHOLD_ANGLE, fireThresholdAngle, dt);
                    if (!facingTarget) {
                        this._spacecraft.resetSpeed();
                    } else {
                        this.approach(targetDistance, maxDistance, 0, acceleration * APPROACH_SPEED_FACTOR);
                    }
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // turning towards target
                    if (targetDistance > maxDistance) {
                        this.turn(targetYawAndPitch.yaw, targetYawAndPitch.pitch, dt);
                    } else {
                        // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                        // orienting into attack position
                        angles = this._spacecraft.getClass().getAttackVectorAngles();
                        thresholdAngle = this._spacecraft.getClass().getAttackThresholdAngle();
                        switch (this._spacecraft.getClass().getTurnStyle()) {
                            case classes.SpacecraftTurnStyle.YAW_PITCH:
                                if ((Math.abs(targetYawAndPitch.yaw - angles[0]) > thresholdAngle) || (Math.abs(targetYawAndPitch.pitch - angles[1]) > thresholdAngle)) {
                                    this.turn(targetYawAndPitch.yaw - angles[0], targetYawAndPitch.pitch - angles[1], dt);
                                }
                                break;
                            case classes.SpacecraftTurnStyle.ROLL_YAW:
                                targetAngles = vec.getRollAndYaw(relativeTargetDirection, true);
                                angleDifference = [targetAngles.roll - angles[0], targetAngles.yaw - angles[1]];
                                if ((Math.abs(angleDifference[0]) > thresholdAngle) || (Math.abs(angleDifference[1]) > thresholdAngle)) {
                                    if (Math.abs(angleDifference[1]) > Math.PI / 2) {
                                        angleDifference[0] = 0;
                                    } else if (Math.abs(angleDifference[0]) > Math.PI / 2) {
                                        angleDifference[1] = 0;
                                    }
                                    this.rollAndYaw(angleDifference[0], angleDifference[1], dt);
                                }
                                break;
                            case classes.SpacecraftTurnStyle.ROLL_PITCH:
                                targetAngles = vec.getRollAndPitch(relativeTargetDirection, true);
                                angleDifference = [targetAngles.roll - angles[0], targetAngles.pitch - angles[1]];
                                if ((Math.abs(angleDifference[0]) > thresholdAngle) || (Math.abs(angleDifference[1]) > thresholdAngle)) {
                                    if (Math.abs(angleDifference[1]) > Math.PI / 2) {
                                        angleDifference[0] = 0;
                                    } else if (Math.abs(angleDifference[0] - Math.sign(angleDifference[0]) * Math.PI) < Math.abs(angleDifference[0])) {
                                        angleDifference[0] -= Math.sign(angleDifference[0]) * Math.PI;
                                        targetAngles.pitch = -targetAngles.pitch;
                                    }
                                    this.rollAndPitch(angleDifference[0], targetAngles.pitch - angles[1], dt);
                                }
                                break;
                        }
                    }
                    // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                    // firing
                    if (vec.length3(vec.diff3(this._spacecraft.getTargetHitPosition(), positionVector)) - baseDistance <=
                            weapons[0].getRange(this._spacecraft.getRelativeVelocityMatrix()[13])) {
                        this._spacecraft.fire(true);
                        this._targetInRange = true;
                    }
                }
            } else {
                // if there is no target...
                this._spacecraft.resetSpeed();
                // ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
                // aiming turnable weapons towards default position
                this._spacecraft.aimWeapons(TURN_THRESHOLD_ANGLE, 0, dt);
            }
        }
    };
    // ##############################################################################
    /**
     * @class
     * Stores and manages a list of AIs that belong to the same battle simulation.
     */
    function AIContext() {
        /**
         * The list of managed AIs.
         * @type Array
         */
        this._ais = [];
    }
    /**
     * Removes all the stored AIs.
     */
    AIContext.prototype.clearAIs = function () {
        this._ais = [];
    };
    /**
     * Adds a new AI of the type associated with the passed type name and sets it up to control the passed spacecraft.
     * @param {String} aiTypeName
     * @param {Spacecraft} spacecraft
     */
    AIContext.prototype.addAI = function (aiTypeName, spacecraft) {
        this._ais.push(new _aiConstructors[aiTypeName](spacecraft));
    };
    /**
     * Performs the control step for all the stored AIs.
     * @param {Number} dt the time elapsed since the last control step, in milliseconds.
     */
    AIContext.prototype.control = function (dt) {
        var i;
        for (i = 0; i < this._ais.length; i++) {
            this._ais[i].control(dt);
        }
    };
    /**
     * Updates the state of all the stored AIs for the case when the scene where the battle simulation happens (all the object in it) has 
     * been moved by the given vector.
     * @param {Number[3]} vector
     */
    AIContext.prototype.handleSceneMoved = function (vector) {
        var i;
        for (i = 0; i < this._ais.length; i++) {
            this._ais[i].handleSceneMoved(vector);
        }
    };
    // setting up the associative array of AI constructors
    _aiConstructors = {};
    _aiConstructors[FIGHTER_AI_NAME] = FighterAI;
    _aiConstructors[SHIP_AI_NAME] = ShipAI;
    // creating the default context
    _context = new AIContext(_aiConstructors);
    // caching frequently used configuration values
    config.executeWhenReady(function () {
        _turnAccelerationDuration = config.getSetting(config.BATTLE_SETTINGS.TURN_ACCELERATION_DURATION_S);
        _turnIntensityBaseFactor = 1000 / _turnAccelerationDuration;
    });
    // -------------------------------------------------------------------------
    // The public interface of the module
    return {
        FIGHTER_AI_NAME: FIGHTER_AI_NAME,
        SHIP_AI_NAME: SHIP_AI_NAME,
        clearAIs: _context.clearAIs.bind(_context),
        addAI: _context.addAI.bind(_context),
        control: _context.control.bind(_context),
        handleSceneMoved: _context.handleSceneMoved.bind(_context)
    };
});