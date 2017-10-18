"use strict";

var Core = require("./lib/Core");
var Error = require("./lib/common/Error");

/**
 * @class
 * @name NodeSDK
 * @description
 *      This module is the core module of the Rainbow SDK for Node.JS <br>.
 *      It gives access to the other modules and allow to start/stop the SDK
 *      <br><br>
 *      The main methods proposed in that module allow to: <br>
 *      - Access to each module like Bubbles, Contacts...<br>
 *      - Access to Event module <br>
 *      - Start and stop the SDK <br>
 *      - Get the version number <br>
 *      - Get the SDK internal state
 */
class NodeSDK {

    constructor(options) {
        process.on("uncaughtException", (err) => {
            console.error(err);
        });

        process.on("warning", (err) => {
            console.error(err);
        });

        process.on("unhandledRejection", (err, p) => {
            console.error(err);
        });

        this._core = new Core(options);
    }

    /**
     * @public
     * @method start
     * @instance
     * @description
     *    Start the SDK
     * @memberof NodeSDK
     */
    start() {
        var that = this;
        return new Promise(function(resolve, reject) {
            that._core.start().then(function() {
                return that._core.signin(false);
            }).then(function() {
                resolve();
            }).catch(function(err) {
                var error = Error.UNAUTHORIZED;
                error.details = err;
                that.events.publish("rainbow_onconnectionerror", error);
                reject(error);
            });
        });
    }

    /**
     * @private
     * @method startCLI
     * @instance
     * @description
     *      Start the SDK in CLI mode
     * @memberof NodeSDK
     */
    startCLI() {
        var that = this;
        return new Promise(function(resolve, reject) {
            that._core.start().then(function() {
                resolve();
            }).catch(function(err) {
                var error = Error.UNAUTHORIZED;
                error.details = err;
                that.events.publish("rainbow_onconnectionerror", error);
                reject(error);
            });
        });
    }

    /**
     * @private
     * @method siginCLI
     * @instance
     * @description
     *      Sign-in in CLI
     * @memberof NodeSDK
     */
    signinCLI() {
        var that = this;
        return new Promise(function(resolve, reject) {
            that._core.signin(false).then(function(json) {
                resolve(json);
            }).catch(function(err) {
                var error = Error.UNAUTHORIZED;
                error.details = err;
                that.events.publish("rainbow_onconnectionerror", error);
                reject(error);
            });
        });
    }

    /**
     * @public
     * @method stop
     * @instance
     * @description
     *    Stop the SDK
     * @memberof NodeSDK
     */
    stop() {
        var that = this;
        return new Promise(function(resolve, reject) {
            that._core.stop().then(function() {
                var success = Error.OK;
                that.events.publish("rainbow_onstopped", success);
                resolve();
            }).catch(function(err) {
                var error = Error.ERROR;
                error.details = err;
                that.events.publish("rainbow_onstopped", error);
                reject(error);
            });
        });
    }

    /**
     * @public
     * @property im
     * @instance
     * @description
     *    Get access to the IM module
     * @memberof NodeSDK
     */
    get im() {
        return this._core.im;
    }

    /**
     * @public
     * @property contacts
     * @instance
     * @description
     *    Get access to the Contacts module
     * @memberof NodeSDK
     */
    get contacts() {
        return this._core.contacts;
    }

    /**
     * @public
     * @property presence
     * @instance
     * @description
     *    Get access to the Presence module
     * @memberof NodeSDK
     */
    get presence() {
        return this._core.presence;
    }

    /**
     * @public
     * @property bubbles
     * @instance
     * @description
     *    Get access to the Bubbles module
     * @memberof NodeSDK
     */
    get bubbles() {
        return this._core.bubbles;
    }

    /**
     * @public
     * @property events
     * @instance
     * @description
     *    Get access to the Events module
     * @memberof NodeSDK
     */    
    get events() {
        return this._core.events;
    }

    /**
     * @private
     * @property fileServer
     * @instance
     * @description
     *    Get access to the File Server module
     * @memberof NodeSDK
     */
    get fileServer() {
        return this._core.fileServer;
    }

    /**
     * @public
     * @property admin
     * @instance
     * @description
     *    Get access to the Admin module
     * @memberof NodeSDK
     */    
    get admin() {
        return this._core.admin;
    }

    /**
     * @private
     * @property rest
     * @instance
     * @description
     *    Get access to the REST module
     * @memberof NodeSDK
     */
    get rest() {
        return this._core.rest;
    }

    /**
     * @public
     * @property settings
     * @instance
     * @description
     *    Get access to the Settings module
     * @memberof NodeSDK
     */
    get settings() {
        return this._core.settings;
    }
    
    /**
     * @public
     * @property state
     * @instance
     * @description
     *    Return the state of the SDK (eg: STOPPED, STARTED, CONNECTED, READY, DISCONNECTED, RECONNECTING)
     * @memberof NodeSDK
     */  
    get state() {
        return this._core.state;
    }

    /**
     * @public
     * @property version
     * @instance
     * @description
     *      Return the version of the SDK
     * @memberof NodeSDK
     */
    get version() {
        return this._core.version;
    }

    /**
     * @public
     * @property version
     * @instance
     * @description
     *      Return the version of the SDK
     * @memberof NodeSDK
     */
    get connectedUser() {
        return this._core.rest.account;
    }

}

module.exports = NodeSDK;