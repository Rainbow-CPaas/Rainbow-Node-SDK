"use strict";
import {Logger} from "../common/Logger";

export {};

import {XMPPService} from "../connection/XMPPService";
import {RESTService} from "../connection/RESTService";
import {isNullOrEmpty, logEntryExit, setTimeoutPromised} from "../common/Utils";
import * as PubSub from "pubsub-js";
import {AlertEventHandler} from '../connection/XMPPServiceHandler/alertEventHandler';
import {Alert, AlertsData} from '../common/models/Alert';
import {ErrorManager} from "../common/ErrorManager";
import {isStarted} from "../common/Utils";
import {EventEmitter} from "events";
import {S2SService} from "./S2SService";
import {Core} from "../Core";
import {Dictionary, List} from "ts-generic-collections-linq";
import {AlertDevice, AlertDevicesData} from "../common/models/AlertDevice";
import {AlertTemplate, AlertTemplatesData} from "../common/models/AlertTemplate";
import {AlertFilter, AlertFiltersData} from "../common/models/AlertFilter";
import {resolveAny} from "dns";
import {isArray} from "util";

const LOG_ID = "ALERTS/SVCE - ";

@logEntryExit(LOG_ID)
@isStarted([])
    /**
     * @module
     * @name AlertsService
     * @version SDKVERSION
     * @public
     * @description
     *      This module is the basic module for handling Alerts in Rainbow.   <br/>
     *   <br/>
     *      Note: the Rainbow subscriptions "Alerts" is need to use the Alert notification system. <br/>  
     */
class AlertsService {
    private _eventEmitter: EventEmitter;
    private _logger: Logger;
    private started: boolean;
    private _initialized: boolean;
    private _xmpp: XMPPService;
    private _rest: RESTService;
    private _options: any;
    private _s2s: S2SService;
    private _useXMPP: any;
    private _useS2S: any;
    private _alertEventHandler: AlertEventHandler;
    private _alertHandlerToken: any;
    //public static $inject: string[] = ['$http', '$log', 'contactService', 'authService', 'roomService', 'conversationService', 'xmppService'];
    private alerts: Alert[] = [];

    private readonly timerFactor = 1; // Used in debug mode to ensure to avoid timeout
    private currentContactId: string = "";
    private currentContactJid: string = "";

    //private readonly Object lockAlertMessagesReceivedPool = new Object();
    private readonly alertsMessagePoolReceived: Dictionary<string, [Date, String]>;      // Store Alert Messages using "AlertMessage.Identifier" as key - Tuple:<AlertMessage.Sent, AlertMessage.MsgType>

    //private readonly Object lockAlertMessagesSentPool = new Object();
    private readonly alertsMessagePoolSent: Dictionary<string, [String, String, Date]>;          // Store Alert Messages using "AlertMessage.Identifier" as key - Tuple:<AlertMessage.Identifier, AlertMessage.Sender, AlertMessage.Sent>

    private readonly delayToSendReceiptReceived: number; // TimeSpan;
    private readonly delayToSendReceiptRead: number; // TimeSpan;
    private delayInfoLoggued: boolean = false;


    private _xmppManagementHandler: any;
    public ready: boolean = false;
    private readonly _startConfig: {
        start_up: boolean,
        optional: boolean
    };
    get startConfig(): { start_up: boolean; optional: boolean } {
        return this._startConfig;
    }

    static getClassName() {
        return 'AlertsService';
    }

    getClassName() {
        return AlertsService.getClassName();
    }

    constructor(_eventEmitter: EventEmitter, logger: Logger, _startConfig) {

        /*********************************************************/
        /**                 LIFECYCLE STUFF                     **/
        /*********************************************************/
        this._startConfig = _startConfig;
        //let that = this;
        this._eventEmitter = _eventEmitter;
        this._xmpp = null;
        this._rest = null;
        this._s2s = null;
        this._options = {};
        this._useXMPP = false;
        this._useS2S = false;
        this._logger = logger;

        this.started = false;
        this._initialized = false;

        //this._eventEmitter.on("evt_internal_alertcreated_handle", this.onAlertCreated.bind(this));
        //this._eventEmitter.on("evt_internal_alertdeleted_handle", this.onAlertDeleted.bind(this));
        this.ready = false;
    }


    public async start(_options, _core: Core) { // , _xmpp : XMPPService, _s2s : S2SService, _rest : RESTService
        let that = this;
        that._xmpp = _core._xmpp;
        that._rest = _core._rest;
        that._options = _options;
        that._s2s = _core._s2s;
        that._useXMPP = that._options.useXMPP;
        that._useS2S = that._options.useS2S;
        this._alertHandlerToken = [];

        that._logger.log("info", LOG_ID + " ");
        that._logger.log("info", LOG_ID + "[start] === STARTING ===");
        let startDate = new Date().getTime();
        this.attachHandlers();

        //this.conversationService.alertService = this;
        //this.attachHandlers();

        let startDuration = Math.round(new Date().getTime() - startDate);
        //stats.push({ service: 'alertService', startDuration: startDuration });
        that._logger.log("info", LOG_ID + `=== STARTED (${startDuration} ms) ===`);
        this.ready = true;

    }

    public async stop() {
        let that = this;

        that._logger.log("info", LOG_ID + "[stop] Stopping");

        //remove all saved call logs
        this.started = false;
        this._initialized = false;

        that._xmpp = null;
        that._rest = null;

        delete that._alertEventHandler;
        that._alertEventHandler = null;
        if (that._alertHandlerToken) {
            that._alertHandlerToken.forEach((token) => PubSub.unsubscribe(token));
        }
        that._alertHandlerToken = [];

        this.ready = false;
        that._logger.log("info", LOG_ID + "[stop] Stopped");
    }

    public async init() {
        let that = this;
        //await this.getServerAlerts();

    }

    private attachHandlers() {
        let that = this;

        that._logger.log("info", LOG_ID + "[attachHandlers] attachHandlers");

        that._alertEventHandler = new AlertEventHandler(that._xmpp, that, that._options);
        that._alertHandlerToken = [
            //PubSub.subscribe(that._xmpp.hash + "." + that._alertEventHandler.MESSAGE_MANAGEMENT, that._alertEventHandler.onManagementMessageReceived.bind(that._alertEventHandler)),
            PubSub.subscribe( that._xmpp.hash + "." + that._alertEventHandler.MESSAGE_HEADLINE, that._alertEventHandler.onHeadlineMessageReceived.bind(that._alertEventHandler)),
            PubSub.subscribe(that._xmpp.hash + "." + that._alertEventHandler.MESSAGE_ERROR, that._alertEventHandler.onErrorMessageReceived.bind(that._alertEventHandler))
        ];
    }


    public async reconnect() {
        // await this.getServerAlerts();
        //this.conversationService.alertService = this;
        this.attachHandlers();
    }

    //region PUBLIC API

    //region Mark as Received / Read

    /**
     * @private
     * @method markAlertMessageAsReceived
     * @instance
     * @async
     * @param {string} jid The Jid of the sender</param>
     * @param {string} messageXmppId the Xmpp Id of the alert message</param>
     * @description
     *    Mark as Received the specified alert message   <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    markAlertMessageAsReceived(jid: string, messageXmppId: string): Promise<any> {
        let that = this;
        /*
        if (!application.Restrictions.AlertMessage)
        {
            callback?.Invoke(new SdkResult<Boolean>("AlertMessage has not been allowed in Application.Restrictions object"));
            return;
        }
        // */

        if (!that.delayInfoLoggued) {
            that.delayInfoLoggued = true;
            that._logger.log("info", LOG_ID + "(markAlertMessageAsReceived) DelayToSendReceipt (in ms) - Received:", that.delayToSendReceiptReceived, " - Read: ", that.delayToSendReceiptRead - that.delayToSendReceiptReceived);
        }

        return that._xmpp.markMessageAsReceived({
            "fromJid": jid,
            "id": messageXmppId
        }, "Headline", that.delayToSendReceiptReceived);
    }

    /**
     * @public
     * @method markAlertMessageAsRead
     * @instance
     * @async
     * @param {string} jid The Jid of the sender
     * @param {string} messageXmppId the Xmpp Id of the alert message
     * @description
     *    Mark as Read the specified alert message   <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    markAlertMessageAsRead(jid: string, messageXmppId: string): Promise<any> {
        let that = this;
        /*if (!application.Restrictions.AlertMessage)
        {
            callback?.Invoke(new SdkResult<Boolean>("AlertMessage has not been allowed in Application.Restrictions object"));
            return;
        } // */

        return that._xmpp.markMessageAsRead({
            "fromJid": jid,
            "id": messageXmppId
        }, "Headline", that.delayToSendReceiptReceived);
        //callback?.Invoke(new SdkResult<Boolean>(true));
    }

//endregion Mark as Received / Read

//region DEVICE

    /**
     * @public
     * @method createDevice
     * @instance
     * @async
     * @param {AlertDevice} device Device to create.
     * @description
     *    Create a device which can receive Alerts(notifications) from the server   <br/>
     *    AlertDevice.jid_im cannot be specified, it's always the Jid of the current user. <br/>
     *    if AlertDevice.jid_resource cannot be specified, it's always the Jid_resource of the current user. <br/>
     *    if AlertDevice.type is not specified, automatically it's set to "desktop" <br/>
     * @return {Promise<AlertDevice>} the result of the operation.
     * @category async
     */
    createDevice(device: AlertDevice): Promise<AlertDevice> {
        return this.createOrUpdateDevice(true, device);
    }

    /**
     * @public
     * @method updateDevice
     * @instance
     * @async
     * @param {AlertDevice} device Device to Update.
     * @description
     *    Update a device which can receive Alerts(notifications) from the server <br/>    
     *    AlertDevice.CompanyId cannot be specified, it's always the Compnay of the current user <br/>    
     *    AlertDevice.Jid_im cannot be specified, it's always the Jid of the current user: Contacts.GetCurrentContactJid() <br/>    
     *    AlertDevice.Jid_resource cannot be specified, it's always the Jid_resource of the current user: Application.GetResourceId() <br/>    
     *    if AlertDevice.Type is not specified, automatically it's set to "desktop"     <br/>
     * @return {Promise<AlertDevice>} the result of the operation.   <br/>
     * @category async
     */
    updateDevice(device: AlertDevice): Promise<AlertDevice> {
        return this.createOrUpdateDevice(false, device);
    }

    private createOrUpdateDevice(create: boolean, device: AlertDevice): Promise<AlertDevice> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (device == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateDevice) bad or empty 'device' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateDevice) bad or empty 'device' parameter : ", device);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }
            let body = {
                "name": device.name,
                "tags": device.tags,
                "ipAddresses": device.ipAddresses,
                "macAddresses": device.macAddresses,
                "geolocation ": device.geolocation,
                "type": (!device.type || device.type === "") ? "desktop" : device.type,
                "jid_resource": that._xmpp.resourceId,
                "domainUsername": device.domainUsername 
            };

            if (create) {
                that._rest.createDevice(body).then(function (json: any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateDevice) create successfull");
                    let id: string = json.id;
                    let name: string = json.name;
                    let type: string= json.type
                    let userId: string = json.userId;
                    let companyId: string = json.companyId;
                    let jid_im: string = json.jid_im;
                    let jid_resource: string = json.jid_resource;
                    let creationDate: string = json.creationDate;
                    let ipAddresses: List<string> = json.ipAddresses;
                    let macAddresses: List<string> = json.macAddresses;
                    let tags: List<string> = json.tags;
                    let geolocation: string = json.geolocation;
                    
                    let deviceCreated = new AlertDevice( id, name, type, userId, companyId, jid_im, jid_resource, creationDate, ipAddresses, macAddresses, tags, geolocation);
                    // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' AlertDevice created : ", deviceCreated);

                    resolve(deviceCreated);
                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateDevice) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateDevice) error : ", err);
                    return reject(err);
                });
            } else {
                // resource = rest.GetResource("notificationsadmin", $"devices/{device.Id}");
                // restRequest = rest.GetRestRequest(resource, Method.PUT);
                that._rest.updateDevice(device.id, body).then(function (json : any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateDevice) create successfull");
                    let id: string = json.id;
                    let name: string = json.name;
                    let type: string= json.type
                    let userId: string = json.userId;
                    let companyId: string = json.companyId;
                    let jid_im: string = json.jid_im;
                    let jid_resource: string = json.jid_resource;
                    let creationDate: string = json.creationDate;
                    let ipAddresses: List<string> = json.ipAddresses;
                    let macAddresses: List<string> = json.macAddresses;
                    let tags: List<string> = json.tags;
                    let geolocation: string = json.geolocation;

                    let deviceCreated = new AlertDevice( id, name, type, userId, companyId, jid_im, jid_resource, creationDate, ipAddresses, macAddresses, tags, geolocation);
                    // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' AlertDevice created : ", deviceCreated);

                    resolve(deviceCreated);
                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateDevice) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateDevice) error : ", err);
                    return reject(err);
                });
            }

        });
    }

    /**
     * @public
     * @method deleteDevice
     * @instance
     * @async
     * @param {AlertDevice} device Device to delete.
     * @description
     *    Delete a device (using its id) <br/>
     * @return {Promise<AlertDevice>} the result of the operation.
     * @category async
     */
    deleteDevice(device: AlertDevice): Promise<AlertDevice> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (device == null) {
                that._logger.log("warn", LOG_ID + "(deleteDevice) bad or empty 'device' parameter");
                that._logger.log("internalerror", LOG_ID + "(deleteDevice) bad or empty 'device' parameter : ", device);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.deleteDevice(device.id).then(function (json: any) {
                that._logger.log("info", LOG_ID + "(deleteDevice) delete successfull");
                let id: string = json.id;
                let name: string = json.name;
                let type: string= json.type
                let userId: string = json.userId;
                let companyId: string = json.companyId;
                let jid_im: string = json.jid_im;
                let jid_resource: string = json.jid_resource;
                let creationDate: string = json.creationDate;
                let ipAddresses: List<string> = json.ipAddresses;
                let macAddresses: List<string> = json.macAddresses;
                let tags: List<string> = json.tags;
                let geolocation: string = json.geolocation;

                let deviceDeleted = new AlertDevice( id, name, type, userId, companyId, jid_im, jid_resource, creationDate, ipAddresses, macAddresses, tags, geolocation);
                //that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json deleted : ", json);
                that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' AlertDevice deleted : ", deviceDeleted);

                resolve(deviceDeleted);

                //resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(deleteDevice) error.");
                that._logger.log("internalerror", LOG_ID + "(deleteDevice) error : ", err);
                return reject(err);
            });

        });
    }

    /**
     * @public
     * @method getDevice
     * @instance
     * @async
     * @param {string} deviceId Id of the device.
     * @description
     *    Get a device using its Id <br/>
     * @return {Promise<AlertDevice>} the result of the operation.
     * @category async
     */
    getDevice(deviceId: string): Promise<AlertDevice> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (deviceId == null) {
                that._logger.log("warn", LOG_ID + "(getDevice) bad or empty 'deviceId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getDevice) bad or empty 'deviceId' parameter : ", deviceId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getDevice(deviceId).then(function (json : any) {
                that._logger.log("info", LOG_ID + "(getDevice) get successfull");
                let id: string = json.id;
                let name: string = json.name;
                let type: string= json.type
                let userId: string = json.userId;
                let companyId: string = json.companyId;
                let jid_im: string = json.jid_im;
                let jid_resource: string = json.jid_resource;
                let creationDate: string = json.creationDate;
                let ipAddresses: List<string> = json.ipAddresses;
                let macAddresses: List<string> = json.macAddresses;
                let tags: List<string> = json.tags;
                let geolocation: string = json.geolocation;

                let deviceDeleted = new AlertDevice( id, name, type, userId, companyId, jid_im, jid_resource, creationDate, ipAddresses, macAddresses, tags, geolocation);
                //that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json deleted : ", json);
                that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' AlertDevice retrieved : ", deviceDeleted);
                resolve(deviceDeleted);

                // resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getDevice) error.");
                that._logger.log("internalerror", LOG_ID + "(getDevice) error : ", err);
                return reject(err);
            });

        });
    }

    /**
     * @public
     * @method getDevices
     * @instance
     * @async
     * @param {string} companyId Allows to filter device list on the companyId provided in this option. (optional) If companyId is not provided, the devices linked to all the companies that the administrator manage are returned.
     * @param {string} userId Allows to filter device list on the userId provided in this option. (optional) If the user has no admin rights, this filter is forced to the logged in user's id (i.e. the user can only list is own devices).
     * @param {string} deviceName Allows to filter device list on the name provided in this option. (optional) The filtering is case insensitive and on partial name match: all devices containing the provided name value will be returned(whatever the position of the match). Ex: if filtering is done on My, devices with the following names are match the filter 'My device', 'My phone', 'This is my device', ...
     * @param {string} type Allows to filter device list on the type provided in this option. (optional, exact match, case sensitive).
     * @param {string} tag Allows to filter device list on the tag provided in this option. (optional, exact match, case sensitive).
     * @param {number} offset Allow to specify the position of first device to retrieve (default value is 0 for the first device). Warning: if offset > total, no results are returned.
     * @param {number} limit Allow to specify the number of devices to retrieve.
     * @description
     *    Get list of devices   <br/>
     * @return {Promise<AlertDevicesData>} the result of the operation.
     * @category async
     */
    getDevices(companyId: string, userId: string, deviceName: string, type: string, tag: string, offset: number = 0, limit: number = 100): Promise<AlertDevicesData> {
        let that = this;
        return new Promise((resolve, reject) => {

            that._rest.getDevices(companyId, userId, deviceName, type, tag, offset, limit).then(async function (json) {
                that._logger.log("info", LOG_ID + "(getDevices) get successfull");
                let alertDevices = new AlertDevicesData(1000);
                if (Array.isArray( json)) {
                    for (const optionsKey in json) {
                        let id: string = json[optionsKey].id;
                        let name: string = json[optionsKey].name;
                        let type: string = json[optionsKey].type
                        let userId: string = json[optionsKey].userId;
                        let companyId: string = json[optionsKey].companyId;
                        let jid_im: string = json[optionsKey].jid_im;
                        let jid_resource: string = json[optionsKey].jid_resource;
                        let creationDate: string = json[optionsKey].creationDate;
                        let ipAddresses: List<string> = json[optionsKey].ipAddresses;
                        let macAddresses: List<string> = json[optionsKey].macAddresses;
                        let tags: List<string> = json[optionsKey].tags;
                        let geolocation: string = json[optionsKey].geolocation;

                        let alertDevice = new AlertDevice(id, name, type, userId, companyId, jid_im, jid_resource, creationDate, ipAddresses, macAddresses, tags, geolocation);
                        //that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json deleted : ", json);
                        that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' AlertDevice retrieved : ", alertDevice);
                        await alertDevices.addAlertDevice(alertDevice);
                    }
                }
                resolve(alertDevices);                
                //resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getDevices) error.");
                that._logger.log("internalerror", LOG_ID + "(getDevices) error : ", err);
                return reject(err);
            });
        });
    }

    /**
     * @public
     * @method getDevicesTags
     * @instance
     * @async
     * @param {string} companyId Allows to list the tags set for devices associated to the companyIds provided in this option. (optional) If companyId is not provided, the tags being set for devices linked to all the companies that the administrator manage are returned.
     * @description
     *    Get list of all tags being assigned to devices of the compagnies managed by the administrator <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    getDevicesTags(companyId: string): Promise<any> {
        let that = this;
        return new Promise((resolve, reject) => {

            that._rest.getDevicesTags(companyId).then(function (json) {
                that._logger.log("info", LOG_ID + "(getDevices) get successfull");
// TODO : make a Data typed with the result.
                resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getDevices) error.");
                that._logger.log("internalerror", LOG_ID + "(getDevices) error : ", err);
                return reject(err);
            });
        });
    }

//endregion DEVICE

//region TEMPLATE

    /**
     * @public
     * @method createTemplate
     * @instance
     * @async
     * @param {AlertTemplate} template Template to create.
     * @description
     *    Create a template <br/>
     * @return {Promise<AlertTemplate>} the result of the operation.
     * @category async
     */
    createTemplate(template: AlertTemplate): Promise<AlertTemplate> {
        return this.createOrUpdateTemplate(true, template);
    }

    /**
     * @public
     * @method updateTemplate
     * @instance
     * @async
     * @param {AlertTemplate} template Template to Update.
     * @description
     *    Update a template  <br/>
     * @return {Promise<AlertTemplate>} the result of the operation.
     * @category async
     */
    updateTemplate(template: AlertTemplate): Promise<AlertTemplate> {
        return this.createOrUpdateTemplate(false, template);
    }

    private createOrUpdateTemplate(create: boolean, template: AlertTemplate): Promise<AlertTemplate> {
        let that = this;
        return new Promise((resolve, reject) => {

            if (template == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateDevice) bad or empty 'template' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateDevice) bad or empty 'template' parameter : ", template);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }
            let body = {
                "event": template.event,
                "companyId": template.companyId,

                "name": template.name,
                "senderName": template.senderName,
                "contact": template.contact,
                "description": template.description,
                "mimeType": isNullOrEmpty(template.mimeType) ? "text/plain" : template.mimeType,

                "headline": template.headline,
                "instruction ": template.instruction,

                "type": isNullOrEmpty(template.type) ? "cap" : template.type,
                "status": isNullOrEmpty(template.status) ? "Actual" : template.status,
                "scope": isNullOrEmpty(template.scope) ? "Public" : template.scope,
                "category": isNullOrEmpty(template.category) ? "Safety" : template.category,
                "urgency": isNullOrEmpty(template.urgency) ? "Immediate" : template.urgency,
                "severity": isNullOrEmpty(template.severity) ? "Severe" : template.severity,
                "certainty": isNullOrEmpty(template.certainty) ? "Observed" : template.certainty
            };

            if (create) {
                that._rest.createTemplate(body).then(function (json:any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateDevice) create successfull");
                    //resolve(json);
                    let id: string = json.id;
                    let name: string = json.name;
                    let companyId: string = json.companyId;
                    let event: string = json.event;
                    let description: string = json.description;
                    let mimeType: string = json.mimeType;
                    let senderName: string = json.senderName;
                    let headline: string = json.headline;
                    let instruction: string = json.instruction;
                    let contact: string = json.contact;
                    let type: string = json.type;
                    let status: string = json.status;
                    let scope: string = json.scope;
                    let category: string = json.category;
                    let urgency: string = json.urgency;
                    let severity: string = json.severity;
                    let certainty: string = json.certainty;


                    let templateCreated = new AlertTemplate(id, name, companyId, event, description, mimeType, senderName, headline, instruction, contact, type, status, scope, category, urgency, severity, certainty);
                    // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateTemplate) 'template' AlertTemplate created : ", templateCreated);

                    resolve(templateCreated);
                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateTemplate) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateTemplate) error : ", err);
                    return reject(err);
                });
            } else {
                that._rest.updateTemplate(template.id, body).then(function (json : any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateTemplate) create successfull");
                    // resolve(json);
                    let id: string = json.id;
                    let name: string = json.name;
                    let companyId: string = json.companyId;
                    let event: string = json.event;
                    let description: string = json.description;
                    let mimeType: string = json.mimeType;
                    let senderName: string = json.senderName;
                    let headline: string = json.headline;
                    let instruction: string = json.instruction;
                    let contact: string = json.contact;
                    let type: string = json.type;
                    let status: string = json.status;
                    let scope: string = json.scope;
                    let category: string = json.category;
                    let urgency: string = json.urgency;
                    let severity: string = json.severity;
                    let certainty: string = json.certainty;


                    let templateCreated = new AlertTemplate(id, name, companyId, event, description, mimeType, senderName, headline, instruction, contact, type, status, scope, category, urgency, severity, certainty);
                    // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateTemplate) 'template' AlertTemplate created : ", templateCreated);

                    resolve(templateCreated);

                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateTemplate) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateTemplate) error : ", err);
                    return reject(err);
                });
            }

        });
    }

    /**
     * @public
     * @method deleteTemplate
     * @instance
     * @async
     * @param {AlertTemplate} template Template to Delete.
     * @description
     *    Delete a template <br/>
     * @return {Promise<AlertTemplate>} the result of the operation.
     * @category async
     */
    deleteTemplate(template: AlertTemplate): Promise<AlertTemplate> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (template == null) {
                that._logger.log("warn", LOG_ID + "(deleteTemplate) bad or empty 'template' parameter");
                that._logger.log("internalerror", LOG_ID + "(deleteTemplate) bad or empty 'template' parameter : ", template);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.deleteTemplate(template.id).then(function (json:any) {
                that._logger.log("info", LOG_ID + "(deleteTemplate) delete successfull");
                // resolve(json);
                let id: string = json.id;
                let name: string = json.name;
                let companyId: string = json.companyId;
                let event: string = json.event;
                let description: string = json.description;
                let mimeType: string = json.mimeType;
                let senderName: string = json.senderName;
                let headline: string = json.headline;
                let instruction: string = json.instruction;
                let contact: string = json.contact;
                let type: string = json.type;
                let status: string = json.status;
                let scope: string = json.scope;
                let category: string = json.category;
                let urgency: string = json.urgency;
                let severity: string = json.severity;
                let certainty: string = json.certainty;


                let templateCreated = new AlertTemplate(id, name, companyId, event, description, mimeType, senderName, headline, instruction, contact, type, status, scope, category, urgency, severity, certainty);
                // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                that._logger.log("internal", LOG_ID + "(createOrUpdateTemplate) 'template' AlertTemplate created : ", templateCreated);

                resolve(templateCreated);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(deleteTemplate) error.");
                that._logger.log("internalerror", LOG_ID + "(deleteTemplate) error : ", err);
                return reject(err);
            });
        });      
    }

    /**
     * @public
     * @method getTemplate
     * @instance
     * @async
     * @param {string} templateId Id of the template.
     * @description
     *    Get an template by id <br/>
     * @return {Promise<AlertTemplate>} the result of the operation.
     * @category async
     */
    getTemplate(templateId: string): Promise<AlertTemplate> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (templateId == null) {
                that._logger.log("warn", LOG_ID + "(getTemplate) bad or empty 'templateId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getTemplate) bad or empty 'templateId' parameter : ", templateId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getTemplate(templateId).then(function (json:any) {
                that._logger.log("info", LOG_ID + "(getTemplate) get successfull");
                // resolve(json);
                let id: string = json.id;
                let name: string = json.name;
                let companyId: string = json.companyId;
                let event: string = json.event;
                let description: string = json.description;
                let mimeType: string = json.mimeType;
                let senderName: string = json.senderName;
                let headline: string = json.headline;
                let instruction: string = json.instruction;
                let contact: string = json.contact;
                let type: string = json.type;
                let status: string = json.status;
                let scope: string = json.scope;
                let category: string = json.category;
                let urgency: string = json.urgency;
                let severity: string = json.severity;
                let certainty: string = json.certainty;


                let templateCreated = new AlertTemplate(id, name, companyId, event, description, mimeType, senderName, headline, instruction, contact, type, status, scope, category, urgency, severity, certainty);
                // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                that._logger.log("internal", LOG_ID + "(createOrUpdateTemplate) 'template' AlertTemplate created : ", templateCreated);

                resolve(templateCreated);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getTemplate) error.");
                that._logger.log("internalerror", LOG_ID + "(getTemplate) error : ", err);
                return reject(err);
            });

        });
    }

    /**
     * @public
     * @method getTemplates
     * @instance
     * @async
     * @param {string} companyId Id of the company (optional).
     * @param {number} offset Offset to use to retrieve templates - if offset > total, no result is returned.
     * @param {number} limit Limit of templates to retrieve (100 by default).
     * @description
     *    Get templates <br/>
     * @return {Promise<AlertTemplatesData>} the result of the operation.
     * @category async
     */
    getTemplates(companyId: string, offset: number = 0, limit: number = 100): Promise<AlertTemplatesData> {
        let that = this;
        return new Promise((resolve, reject) => {

            that._rest.getTemplates(companyId, offset, limit).then(async function (json) {
                that._logger.log("info", LOG_ID + "(getTemplates) get successfull");
                // resolve(json);
                let alertTemplatesData = new AlertTemplatesData(1000);
                if (Array.isArray( json)) {
                    for (const optionsKey in json) {
                        let id: string = json[optionsKey].id;
                        let name: string = json[optionsKey].name;
                        let companyId: string = json[optionsKey].companyId;
                        let event: string = json[optionsKey].event;
                        let description: string = json[optionsKey].description;
                        let mimeType: string = json[optionsKey].mimeType;
                        let senderName: string = json[optionsKey].senderName;
                        let headline: string = json[optionsKey].headline;
                        let instruction: string = json[optionsKey].instruction;
                        let contact: string = json[optionsKey].contact;
                        let type: string = json[optionsKey].type;
                        let status: string = json[optionsKey].status;
                        let scope: string = json[optionsKey].scope;
                        let category: string = json[optionsKey].category;
                        let urgency: string = json[optionsKey].urgency;
                        let severity: string = json[optionsKey].severity;
                        let certainty: string = json[optionsKey].certainty;


                        let templateCreated = new AlertTemplate(id, name, companyId, event, description, mimeType, senderName, headline, instruction, contact, type, status, scope, category, urgency, severity, certainty);
                        // that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'device' json received : ", json);
                        that._logger.log("internal", LOG_ID + "(createOrUpdateTemplate) 'template' AlertTemplate created : ", templateCreated);

                        await alertTemplatesData.addAlertTemplate(templateCreated);
                    }
                }
                resolve(alertTemplatesData);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getTemplates) error.");
                that._logger.log("internalerror", LOG_ID + "(getTemplates) error : ", err);
                return reject(err);
            });
        });
    }

//endregion TEMPLATE

//region FILTERS

    /**
     * @public
     * @method createFilter
     * @instance
     * @async
     * @param {AlertFilter} filter Filter to create.
     * @description
     *    Create a filter <br/>
     * @return {Promise<AlertFilter>} the result of the operation.
     * @category async
     */
    createFilter(filter: AlertFilter): Promise<AlertFilter> {
        return this.createOrUpdateFilter(true, filter);
    }

    /**
     * @public
     * @method updateFilter
     * @instance
     * @async
     * @param {AlertFilter} filter Filter to Update.
     * @description
     *    Update a filter <br/>
     * @return {Promise<AlertFilter>} the result of the operation.
     * @category async
     */
    updateFilter(filter: AlertFilter) : Promise<AlertFilter> {
        return this.createOrUpdateFilter(false, filter);
    }

    createOrUpdateFilter(create: boolean, filter: AlertFilter): Promise<AlertFilter> {
        let that = this;
        return new Promise((resolve, reject) => {

            if (filter == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateFilter) bad or empty 'filter' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateFilter) bad or empty 'filter' parameter : ", filter);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }
            let body : any = {};
            if (filter.name) {
                body.name = filter.name;
            }
            if (filter.companyId) {
                body.companyId = filter.companyId;
            }
             if (filter.tags) {
                 body.tags = filter.tags;
             }

            if (create) {
                that._rest.createFilter(body).then(function (json: any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateFilter) create successfull");
                 //   resolve(json);
                    let id: string = json.id;
                    let name: string = json.name;
                    let companyId: string = json.companyId;
                    let tags: List<string> = json.tags;

                    let alertFilter = new AlertFilter(id, name, companyId, tags);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateDevice) 'filter' AlertFilter retrieved : ", alertFilter);
                    resolve(alertFilter);
                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateFilter) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateFilter) error : ", err);
                    return reject(err);
                });
            } else {
                that._rest.updateFilter(filter.id, body).then(function (json : any) {
                    that._logger.log("info", LOG_ID + "(createOrUpdateFilter) create successfull");
                    let id: string = json.id;
                    let name: string = json.name;
                    let companyId: string = json.companyId;
                    let tags: List<string> = json.tags;

                    let alertFilter = new AlertFilter(id, name, companyId, tags);
                    that._logger.log("internal", LOG_ID + "(createOrUpdateFilter) 'filter' AlertFilter retrieved : ", alertFilter);
                    resolve(alertFilter);
                    //resolve(json);
                }).catch(function (err) {
                    that._logger.log("error", LOG_ID + "(createOrUpdateFilter) error.");
                    that._logger.log("internalerror", LOG_ID + "(createOrUpdateFilter) error : ", err);
                    return reject(err);
                });
            }

        });
    }

    /**
     * @public
     * @method deleteFilter
     * @instance
     * @async
     * @param {AlertFilter} filter Filter to Delete.
     * @description
     *    Delete a filter <br/>
     * @return {Promise<AlertFilter>} the result of the operation.
     * @category async
     */
    deleteFilter(filter: AlertFilter): Promise<AlertFilter> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (filter == null) {
                that._logger.log("warn", LOG_ID + "(deleteFilter) bad or empty 'filter' parameter");
                that._logger.log("internalerror", LOG_ID + "(deleteFilter) bad or empty 'filter' parameter : ", filter);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.deleteFilter(filter.id).then(function (json:any) {
                that._logger.log("info", LOG_ID + "(deleteFilter) delete successfull");
                // resolve(json);
                let id: string = json.id;
                let name: string = json.name;
                let companyId: string = json.companyId;
                let tags: List<string> = json.tags;

                let alertFilter = new AlertFilter(id, name, companyId, tags);
                that._logger.log("internal", LOG_ID + "(deleteFilter) 'filter' AlertFilter retrieved : ", alertFilter);
                resolve(alertFilter);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(deleteFilter) error.");
                that._logger.log("internalerror", LOG_ID + "(deleteFilter) error : ", err);
                return reject(err);
            });

        });
    }

    /**
     * @public
     * @method getFilter
     * @instance
     * @async
     * @param {string} filterId Id of the Filter.
     * @description
     *    Get an filter by id <br/>
     * @return {Promise<AlertFilter>} the result of the operation.
     * @category async
     */
    getFilter(filterId: string): Promise<AlertFilter> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (filterId == null) {
                that._logger.log("warn", LOG_ID + "(getFilter) bad or empty 'filterId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getFilter) bad or empty 'filterId' parameter : ", filterId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getFilter(filterId).then(function (json:any) {
                that._logger.log("info", LOG_ID + "(getFilter) get successfull");
                //resolve(json);
                let id: string = json.id;
                let name: string = json.name;
                let companyId: string = json.companyId;
                let tags: List<string> = json.tags;

                let alertFilter = new AlertFilter(id, name, companyId, tags);
                that._logger.log("internal", LOG_ID + "(getFilter) 'filter' AlertFilter retrieved : ", alertFilter);
                resolve(alertFilter);

            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getFilter) error.");
                that._logger.log("internalerror", LOG_ID + "(getFilter) error : ", err);
                return reject(err);
            });

        });      
    }

    /**
     * @public
     * @method getFilters
     * @instance
     * @async
     * @param {number} offset Offset to use to retrieve filters - if offset > total, no result is returned.
     * @param {number} limit Limit of filters to retrieve (100 by default).
     * @description
     *    Get filters : have required role(s) superadmin, admin <br/>
     * @return {Promise<AlertFiltersData>} the result of the operation.
     * @category async
     */
    getFilters(offset: number = 0, limit: number = 100): Promise<AlertFiltersData> {
        let that = this;
        return new Promise((resolve, reject) => {

            that._rest.getFilters(offset, limit).then(async function (json:any) {
                that._logger.log("info", LOG_ID + "(getFilters) get successfull");
                that._logger.log("internal", LOG_ID + "(getFilters) get successfull : ", json);
                //resolve(json);

                let alertFilters = new AlertFiltersData(1000);
                if (Array.isArray( json)) {
                    for (const optionsKey in json) {
                        let id: string = json[optionsKey].id;
                        let name: string = json[optionsKey].name;
                        let companyId: string = json[optionsKey].companyId;
                        let tags: List<string> = json[optionsKey].tags;

                        let alertFilter = new AlertFilter(id, name, companyId, tags);
                        that._logger.log("internal", LOG_ID + "(getFilters) 'filter' AlertFilter retrieved : ", alertFilter);
                        await alertFilters.addAlertFilter(alertFilter);
                    }
                }
                resolve(alertFilters);

            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getFilters) error.");
                that._logger.log("internalerror", LOG_ID + "(getFilters) error : ", err);
                return reject(err);
            });
        });
    }

//endregion FILTERS

//region CREATE / UPDATE / DELETE / GET / FEEDBACK ALERTS

    /**
     * @public
     * @method createAlert
     * @instance
     * @async
     * @param {Alert} alert Alert to send.
     * @description
     *    To create an alert. The alert will be sent using the StartDate of the Alert object (so it's possible to set it in future). <br/>  
     *    The alert will be received by devices according the filter id and the company id used.   <br/>
     *    The content of the alert is based on the template id.   <br/>
     * @return {Promise<Alert>} the result of the operation.  
     * @category async
     */
    createAlert(alert: Alert): Promise<Alert> {
        return this.createOrUpdateAlert(true, alert);
    }

    /**
     * @public
     * @method updateAlert
     * @instance
     * @async
     * @param {Alert} alert Alert to update.
     * @description
     *    To update an existing alert. The alert will be sent using the StartDate of the Alert object (so it's possible to set it in future). <br/>  
     *    The alert will be received by devices according the filter id and the company id used.   <br/>
     *    The content of the alert is based on the template id.   <br/>
     *    Note : if no expirationDate is provided, then the validity is one day from the API call. <br/>  
     * @return {Promise<Alert>} the result of the operation.
     * @category async
     */
    updateAlert(alert: Alert): Promise<Alert> {
        return this.createOrUpdateAlert(false, alert);
    }

    createOrUpdateAlert(create: boolean, alert: Alert): Promise<Alert> {
        let that = this;
        return new Promise((resolve, reject) => {

            if (alert == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateAlert) bad or empty 'alert' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) bad or empty 'alert' parameter : ", alert);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            try {
                
                let date: Date = alert.startDate ? new Date(alert.startDate) : new Date();

                let expirationDate: Date = new Date();
                expirationDate.setDate(expirationDate.getDate() + 1);
                if (alert.expirationDate) {
                    expirationDate = new Date(alert.expirationDate);
                }

                let body: any = {};
                
                if (alert.name){
                    body.name = alert.name;
                }

                if (alert.description){
                    body.description = alert.description;
                }
                
                if (alert.companyId) {
                    body.companyId = alert.companyId;
                }

                if (alert.templateId) {
                    body.notificationTemplateId = alert.templateId;
                }

                if (alert.filterId) {
                    body.notificationFilterId = alert.filterId;
                }

                body.startDate = date.toISOString();
                body.expirationDate = expirationDate.toISOString();

                that._logger.log("info", LOG_ID + "(createOrUpdateAlert) body : ", body);

                if (create) {
                    that._rest.createAlert(body).then(function (json : any) {
                        that._logger.log("info", LOG_ID + "(createOrUpdateAlert) create successfull");
                        let  id: string = json.id;
                        let  name: string = json.name;
                        let  description: string = json.description;
                        let  status: string = json.status;
                        let  templateId: string = json.templateId;
                        let  filterId: string = json.filterId;
                        let  companyId: string = json.companyId;
                        let  startDate: string = json.startDate;
                        let  expirationDate: string = json.expirationDate;

                        let alert = new Alert(name, description, status, templateId, filterId, companyId, startDate, expirationDate);
                        alert.id = id;
                        that._logger.log("internal", LOG_ID + "(createOrUpdateAlert) 'Alert' Alert created : ", alert);
                        resolve(alert);                            
                    }).catch(function (err) {
                        that._logger.log("error", LOG_ID + "(createOrUpdateAlert) error.");
                        that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) error : ", err);
                        return reject(err);
                    });
                } else {
                    that._rest.updateAlert(alert.id, body).then(function (json : any) {
                        that._logger.log("info", LOG_ID + "(createOrUpdateAlert) create successfull");
                        let  id: string = json.id;
                        let  name: string = json.name;
                        let  description: string = json.description;
                        let  status: string = json.status;
                        let  templateId: string = json.templateId;
                        let  filterId: string = json.filterId;
                        let  companyId: string = json.companyId;
                        let  startDate: string = json.startDate;
                        let  expirationDate: string = json.expirationDate;

                        let alert = new Alert(name, description, status, templateId, filterId, companyId, startDate, expirationDate);
                        alert.id = id;
                        that._logger.log("internal", LOG_ID + "(createOrUpdateAlert) 'Alert' Alert updated : ", alert);
                        resolve(alert);
                    }).catch(function (err) {
                        that._logger.log("error", LOG_ID + "(createOrUpdateAlert) error.");
                        that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) error : ", err);
                        return reject(err);
                    });
                }
            } catch (err) {
                that._logger.log("error", LOG_ID + "(createOrUpdateAlert) CATCH Error !!!");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) CATCH Error !!! error : ", err);
                return reject(err);
            }
        });
    }

    /**
     * @public
     * @method deleteAlert
     * @instance
     * @async
     * @param {Alert} alert Alert to Delete.
     * @description
     *    Delete an alert   <br/>
     *    All the data related to this notification are deleted, including the reports <br/>  
     * @return {Promise<Alert>} the result of the operation.
     * @category async
     */
    deleteAlert(alert: Alert): Promise<Alert> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */


            if (alert == null) {
                that._logger.log("warn", LOG_ID + "(deleteAlert) bad or empty 'alert' parameter");
                that._logger.log("internalerror", LOG_ID + "(deleteAlert) bad or empty 'alert' parameter : ", alert);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.deleteAlert(alert.id).then(function (json : any) {
                that._logger.log("info", LOG_ID + "(deleteAlert) delete successfull");
                let  id: string = json.id;
                let  name: string = json.name;
                let  description: string = json.description;
                let  status: string = json.status;
                let  templateId: string = json.templateId;
                let  filterId: string = json.filterId;
                let  companyId: string = json.companyId;
                let  startDate: string = json.startDate;
                let  expirationDate: string = json.expirationDate;

                let alert = new Alert(name, description, status, templateId, filterId, companyId, startDate, expirationDate);
                alert.id = id;
                that._logger.log("internal", LOG_ID + "(createOrUpdateAlert) 'Alert' Alert deleted : ", alert);
                resolve(alert);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(deleteAlert) error.");
                that._logger.log("internalerror", LOG_ID + "(deleteAlert) error : ", err);
                return reject(err);
            });
        });
    }

    /**
     * @public
     * @method getAlert
     * @instance
     * @async
     * @param {string} alertId Id of the alert.
     * @description
     *    Get an alert by id <br/>
     * @return {Promise<Alert>} the result of the operation.
     * @category async
     */
    getAlert(alertId: string): Promise<Alert> {
        let that = this;
        return new Promise((resolve, reject) => {
            /*
            if (!application.Restrictions.AlertMessage)
            {
                callback?.Invoke(new SdkResult<AlertDevice>("AlertMessage has not been allowed in Application.Restrictions object"));
                return;
            }
            // */

            if (alertId == null) {
                that._logger.log("warn", LOG_ID + "(getAlert) bad or empty 'alertId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getAlert) bad or empty 'alertId' parameter : ", alertId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getAlert(alertId).then(function (json: any) {
                that._logger.log("info", LOG_ID + "(getAlert) get successfull");
                let  id: string = json.id;
                let  name: string = json.name;
                let  description: string = json.description;
                let  status: string = json.status;
                let  templateId: string = json.templateId;
                let  filterId: string = json.filterId;
                let  companyId: string = json.companyId;
                let  startDate: string = json.startDate;
                let  expirationDate: string = json.expirationDate;

                let alert = new Alert(name, description, status, templateId, filterId, companyId, startDate, expirationDate);
                alert.id = id;
                that._logger.log("internal", LOG_ID + "(createOrUpdateAlert) 'Alert' Alert created : ", alert);
                resolve(alert);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getAlert) error.");
                that._logger.log("internalerror", LOG_ID + "(getAlert) error : ", err);
                return reject(err);
            });
        });
    }

    /**
     * @public
     * @method getAlerts
     * @instance
     * @async
     * @param {number} offset Offset to use to retrieve Alerts - if offset > total, no result is returned.
     * @param {number} limit Limit of Alerts to retrieve (100 by default).
     * @description
     *    Get alerts : required role(s) superadmin,support,admin <br/>
     * @return {Promise<AlertsData>} the result of the operation.
     * @category async
     */
    getAlerts(offset: number = 0, limit: number = 100): Promise<AlertsData> {
        let that = this;
        return new Promise((resolve, reject) => {

            that._rest.getAlerts(offset, limit).then(async function (json : any) {
                that._logger.log("info", LOG_ID + "(getAlerts) get successfull");

                let alerts : AlertsData = new AlertsData(json.limit);
                alerts.offset = json.offset;
                alerts.total = json.total;
                if (Array.isArray( json.data)) {
                    for (const optionsKey in json.data) {
                        let  id: string = json.data[optionsKey].id;
                        let  name: string = json.data[optionsKey].name;
                        let  description: string = json.data[optionsKey].description;
                        let  status: string = json.data[optionsKey].status;
                        let  templateId: string = json.data[optionsKey].templateId;
                        let  filterId: string = json.data[optionsKey].filterId;
                        let  companyId: string = json.data[optionsKey].companyId;
                        let  startDate: string = json.data[optionsKey].startDate;
                        let  expirationDate: string = json.data[optionsKey].expirationDate;

                        let alert = new Alert(name, description, status, templateId, filterId, companyId, startDate, expirationDate);
                        alert.id = id;
                        that._logger.log("internal", LOG_ID + "(getAlerts) 'alert' Alert retrieved : ", alert);
                        await alerts.addAlert(alert);
                    }
                }
                resolve(alerts);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getAlerts) error.");
                that._logger.log("internalerror", LOG_ID + "(getAlerts) error : ", err);
                return reject(err);
            });
        });      
    }

    /**
     * @public
     * @method sendAlertFeedback
     * @instance
     * @async
     * @param {string} deviceId Id of the device.
     * @param {string} alertId Id of the alert.
     * @param {string} answerId Id of the answer.
     * @description
     *    To send a feedback from an alert.   <br/>
     *    To be used by end-user who has received the alert   <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    sendAlertFeedback(deviceId: string, alertId: string, answerId: string): Promise<any> {
        let that = this;
        return new Promise((resolve, reject) => {

            if (deviceId == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateAlert) bad or empty 'deviceId' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) bad or empty 'deviceId' parameter : ", deviceId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }
            if (alertId == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateAlert) bad or empty 'alertId' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) bad or empty 'alertId' parameter : ", alertId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }
            if (answerId == null) {
                that._logger.log("warn", LOG_ID + "(createOrUpdateAlert) bad or empty 'answerId' parameter");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) bad or empty 'answerId' parameter : ", answerId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            let body = {
                "deviceId": deviceId,
                "data": {"answerId": answerId}
            };


            that._rest.sendAlertFeedback(alertId, body).then(function (json) {
                that._logger.log("info", LOG_ID + "(createOrUpdateAlert) create successfull");
                resolve(json);
// TODO : make the Alert with the result. And maybe the AlertDeviceData.

            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(createOrUpdateAlert) error.");
                that._logger.log("internalerror", LOG_ID + "(createOrUpdateAlert) error : ", err);
                return reject(err);
            });
        });        
    }

//endregion CREATE / UPDATE / DELETE / GET / FEEDBACK ALERTS

//region REPORTS

    /**
     * @public
     * @method getReportSummary
     * @instance
     * @async
     * @param {string} alertId Id of the alert.
     * @description
     *    Allow to retrieve the list of summary reports of an alert (initial alert plus alerts update if any). <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    getReportSummary(alertId: string): Promise<any> {
        let that = this;
        return new Promise((resolve, reject) => {
            if (alertId == null) {
                that._logger.log("warn", LOG_ID + "(getReportSummary) bad or empty 'alertId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getReportSummary) bad or empty 'alertId' parameter : ", alertId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getReportSummary(alertId).then(function (json) {
                that._logger.log("info", LOG_ID + "(getReportSummary) get successfull");
// TODO : make a Data typed with the result.
                resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getReportSummary) error.");
                that._logger.log("internalerror", LOG_ID + "(getReportSummary) error : ", err);
                return reject(err);
            });
        });
    }

    /**
     * @public
     * @method getReportDetails
     * @instance
     * @async
     * @param {string} alertId Id of the alert.
     * @description
     *    Allow to retrieve detail the list of detail reports of a alert (initial alert plus alerts update if any). <br/>
     * @return {Promise<any>} the result of the operation.
     * @category async
     */
    getReportDetails(alertId: string): Promise<any> {
        let that = this;
        return new Promise((resolve, reject) => {
            if (alertId == null) {
                that._logger.log("warn", LOG_ID + "(getReportDetails) bad or empty 'alertId' parameter");
                that._logger.log("internalerror", LOG_ID + "(getReportDetails) bad or empty 'alertId' parameter : ", alertId);
                reject(ErrorManager.getErrorManager().BAD_REQUEST);
                return;
            }

            that._rest.getReportDetails(alertId).then(function (json) {
                that._logger.log("info", LOG_ID + "(getReportDetails) get successfull");
// TODO : make a Data typed with the result.
                resolve(json);
            }).catch(function (err) {
                that._logger.log("error", LOG_ID + "(getReportDetails) error.");
                that._logger.log("internalerror", LOG_ID + "(getReportDetails) error : ", err);
                return reject(err);
            });
        });        
    }

//endregion REPORTS

//endregion PUBLIC API


}

module.exports.AlertsService = AlertsService;
export {AlertsService};
