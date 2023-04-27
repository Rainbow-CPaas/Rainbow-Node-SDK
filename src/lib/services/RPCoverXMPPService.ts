"use strict";

import {Dictionary, IDictionary, List} from "ts-generic-collections-linq";
import * as deepEqual from "deep-equal";
import {GuestParams, MEDIATYPE, RESTService} from "../connection/RESTService";
import {ErrorManager} from "../common/ErrorManager";
import {XMPPService} from "../connection/XMPPService";
import {EventEmitter} from "events";
import {getBinaryData, isStarted, logEntryExit, resizeImage, until} from "../common/Utils";
import {Logger} from "../common/Logger";
import {ContactsService} from "./ContactsService";
import {ProfilesService} from "./ProfilesService";
import {S2SService} from "./S2SService";
import {Core} from "../Core";
import * as PubSub from "pubsub-js";
import {GenericService} from "./GenericService";
//import {RBVoice} from "../common/models/rbvoice";
//import {RBVoiceEventHandler} from "../connection/XMPPServiceHandler/rbvoiceEventHandler";
import {Channel} from "../common/models/Channel";
import {RpcoverxmppEventHandler} from "../connection/XMPPServiceHandler/rpcoverxmppEventHandler";
import {RPCManager, RPCmethod} from "../common/RPCManager.js";

export {};

const LOG_ID = "RPCoverXMPP/SVCE - ";

@logEntryExit(LOG_ID)
@isStarted([])
    /**
     * @module
     * @name RPCoverXMPPService
     * @version SDKVERSION
     * @public
     * @description
     *      This service manages an RPC over XMPP requests system.<br>
     */
class RPCoverXMPPService extends GenericService {
    private avatarDomain: string;
    private readonly _protocol: string = null;
    private readonly _host: string = null;
    private readonly _port: string = null;
    //private _rbvoice: Array<RBVoice>;

    //private rbvoiceEventHandler: RBVoiceEventHandler;
    //private RPCoverXMPPEventHandler : RPCoverXMPPEventHandler;
    private RPCoverXMPPHandlerToken: any;
    public rpcManager: RPCManager;

    static getClassName() {
        return 'RPCoverXMPPService';
    }

    getClassName() {
        return RPCoverXMPPService.getClassName();
    }

    constructor(_eventEmitter: EventEmitter, _http: any, _logger: Logger, _startConfig: {
        start_up: boolean,
        optional: boolean
    }) {
        super(_logger, LOG_ID);
        this._xmpp = null;
        this._rest = null;
        this._s2s = null;
        this._options = {};
        this._useXMPP = false;
        this._useS2S = false;
        this._eventEmitter = _eventEmitter;
        this._logger = _logger;
        this._startConfig = _startConfig;
        this._protocol = _http.protocol;
        this._host = _http.host;
        this._port = _http.port;
        
        this.rpcManager = new RPCManager(this._logger);

        this.avatarDomain = this._host.split(".").length===2 ? this._protocol + "://cdn." + this._host + ":" + this._port:this._protocol + "://" + this._host + ":" + this._port;

        // this._eventEmitter.on("evt_internal_createrbvoice", this.onCreateRBVoice.bind(this));
        // this._eventEmitter.on("evt_internal_deleterbvoice", this.onDeleteRBVoice.bind(this));

    }

    start(_options, _core: Core) { // , _xmpp : XMPPService, _s2s : S2SService, _rest : RESTService, _contacts : ContactsService, _profileService : ProfilesService
        let that = this;

        return new Promise(async function (resolve, reject) {
            try {
                that._xmpp = _core._xmpp;
                that._rest = _core._rest;
                that._options = _options;
                that._s2s = _core._s2s;
                that._useXMPP = that._options.useXMPP;
                that._useS2S = that._options.useS2S;
                //that._rbvoice = [];
                that.attachHandlers();
                that.setStarted();
                resolve(undefined);
            } catch (err) {
                return reject();
            }
        });
    }

    stop() {
        let that = this;

        return new Promise(function (resolve, reject) {
            try {
                that._xmpp = null;
                that._rest = null;
                if (that.RPCoverXMPPHandlerToken) {
                    that.RPCoverXMPPHandlerToken.forEach((token) => PubSub.unsubscribe(token));
                }
                that.RPCoverXMPPHandlerToken = [];
                //that._rbvoice = null;
                that.setStopped();
                resolve(undefined);
            } catch (err) {
                return reject(err);
            }
        });
    }

    async init(useRestAtStartup : boolean) {
        let that = this;
        
        // Maybe it should not be reset for reconnection.
        await that.rpcManager.reset();
        
        let rpcMethod = new RPCmethod();
        rpcMethod.methodName = "system.listMethods";
        rpcMethod.methodHelp = "system.listMethods";
        rpcMethod.methodDescription = "system.listMethods";
        rpcMethod.methodCallback = () => { return that.rpcManager.listMethods();};
        that.rpcManager.add(rpcMethod);
        
        that.setInitialized();
    }

    attachHandlers() {
        let that = this;
        //that.RPCoverXMPPEventHandler = that._xmpp.RPCoverXMPPEventHandler;
        that.RPCoverXMPPHandlerToken = [
            //PubSub.subscribe( that._xmpp.hash + "." + that.rbvoiceEventHandler.MESSAGE_MANAGEMENT, that.rbvoiceEventHandler.onManagementMessageReceived.bind(that.rbvoiceEventHandler)),
            //PubSub.subscribe( that._xmpp.hash + "." + that.rbvoiceEventHandler.MESSAGE_ERROR, that.rbvoiceEventHandler.onErrorMessageReceived.bind(that.rbvoiceEventHandler))
        ];
    }

    //region Rainbow RPCoverXMPP RPC Server

    /**
     * @public
     * @method addRPCMethod
     * @since 2.22.0
     * @instance
     * @async
     * @category Rainbow RPCoverXMPP RPC Server
     * @description
     *    This API allows to expose an RPC method to requests from an XMPP party. <br>
     * @param {string} methodName The name of the method to be added from RPC server
     * @param {string} methodCallback The callback of the method to be added from RPC server
     * @param {string} methodDescription The description of the method to be added from RPC server
     * @param {string} methodHelp The help of the method to be added from RPC server
     * @return {Promise<any>} An object of the result
     */    
    addRPCMethod(methodName : string = undefined, methodCallback : any = undefined, methodDescription : string = undefined, methodHelp : string = undefined ) {
        let that = this;

        return new Promise(async (resolve, reject) => {
            if (!methodName) {
                that._logger.log("error", LOG_ID + "(addRPCMethod) Parameter 'methodName' is missing or null");
                throw ErrorManager.getErrorManager().BAD_REQUEST();
            }

            if (!methodCallback) {
                that._logger.log("error", LOG_ID + "(addRPCMethod) Parameter 'callback' is missing or null");
                throw ErrorManager.getErrorManager().BAD_REQUEST();
            }

            try {
                let rpcMethod = new RPCmethod(methodName, methodCallback, methodDescription , methodHelp );
                let result = await that.rpcManager.add(rpcMethod);
                that._logger.log("debug", LOG_ID + "(addRPCMethod) add done : ", result);
                resolve(result);
            } catch (err) {
                that._logger.log("error", LOG_ID + "(addRPCMethod) Error.");
                that._logger.log("internalerror", LOG_ID + "(addRPCMethod) Error : ", err);
                return reject(err);
            }
        });
    }

    /**
     * @public
     * @method removeRPCMethod
     * @since 2.22.0
     * @instance
     * @async
     * @category Rainbow RPCoverXMPP RPC Server
     * @description
     *    This API allows to remove an RPC method from RPC Server. <br>
     * @param {string} methodName The name of the method to be removed from RPC server
     * @return {Promise<any>} An object of the result
     */    
    removeRPCMethod(methodName : string = undefined ) {
        let that = this;

        return new Promise(async (resolve, reject) => {
            if (!methodName) {
                that._logger.log("error", LOG_ID + "(get) Parameter 'methodName' is missing or null");
                throw ErrorManager.getErrorManager().BAD_REQUEST();
            }

            try {
                let result = await that.rpcManager.remove(methodName);
                that._logger.log("debug", LOG_ID + "(removeRPCMethod) remove done : ", result);
                resolve(result);
            } catch (err) {
                that._logger.log("error", LOG_ID + "(removeRPCMethod) Error.");
                that._logger.log("internalerror", LOG_ID + "(removeRPCMethod) Error : ", err);
                return reject(err);
            }
        });
    }

    //endregion Rainbow RPCoverXMPP RPC Server

    //region Rainbow RPCoverXMPP RPC Client

    /**
     * @public
     * @method discoverRPCoverXMPP
     * @since 2.22.0
     * @instance
     * @async
     * @category Rainbow RPCoverXMPP RPC Client
     * @description
     *    This API allows to send a discover presence to a bare jid to find the resources availables. <br>
     * @param {Object} headers The Http Headers used to web request.
     * @param {string} rpcoverXMPPserver_jid the jid of the http over xmpp server used to retrieve the HTTP web request. default value is the jid of the account running the SDK.
     * @return {Promise<any>} An object of the result
     */
    discoverRPCoverXMPP(headers: any = {}, rpcoverxmppserver_jid? : string) {
        let that = this;

        return new Promise(async (resolve, reject) => {
            if (!rpcoverxmppserver_jid) {
                rpcoverxmppserver_jid = that._rest.account.jid;
            }

            try {
                
                let node = await that._xmpp.discoverRPCoverXMPP(rpcoverxmppserver_jid, headers);
                that._logger.log("debug", "(discoverRPCoverXMPP) - sent.");
                that._logger.log("internal", "(discoverRPCoverXMPP) - result : ", node);
                let xmlNodeStr = node ? node.toString():"<xml></xml>";
                let reqObj = await that._xmpp.rpcoverxmppEventHandler.getJsonFromXML(xmlNodeStr);

                resolve(reqObj);
            } catch (err) {
                that._logger.log("error", LOG_ID + "(discoverRPCoverXMPP) Error.");
                that._logger.log("internalerror", LOG_ID + "(discoverRPCoverXMPP) Error : ", err);
                return reject(err);
            }
        });
    }
    
    /**
     * @public
     * @method methodCallRPCoverXMPP
     * @since 2.22.0
     * @instance
     * @async
     * @category Rainbow RPCoverXMPP RPC Client
     * @description
     *    This API allows to send a request to call a rpc method to a bare jid to find the resources availables. <br>
     * @param {string} rpcoverxmppserver_jid the jid of the rpc over xmpp server used to retrieve the request. default value is the jid of the account running the SDK.
     * @param {string} methodName method name of the rpc over xmpp shared method on server used to retrieve the request. default value is "" for listing the available methods on server.
     * @param {Object} params Object with the parameters for the RPC request.
     * @return {Promise<any>} An object of the result
     */
    methodCallRPCoverXMPP( rpcoverxmppserver_jid? : string, methodName : string = "system.listMethods", params : Array<any> = []) {
        let that = this;

        return new Promise(async (resolve, reject) => {
            if (!rpcoverxmppserver_jid) {
                rpcoverxmppserver_jid = that._xmpp.fullJid;//that._rest.account.jid;
            }

            try {

                /*
                let node = await that._xmpp.methodCallRPCoverXMPP(rpcoverxmppserver_jid, methodName ,params);
                that._logger.log("debug", "(methodCallRPCoverXMPP) - sent.");
                that._logger.log("internal", "(methodCallRPCoverXMPP) - result : ", node);
                 let xmlNodeStr = node ? node.toString():"<xml></xml>";
                let reqObj = await that._xmpp.rpcoverxmppEventHandler.getJsonFromXML(xmlNodeStr);

                let methodResponse = ( reqObj && reqObj.iq && reqObj.iq.query ) ? reqObj.iq.query.methodResponse : undefined;                 
                resolve(reqObj);
                // */
                
                let result = await that._xmpp.methodCallRPCoverXMPP(rpcoverxmppserver_jid, methodName ,params);
                that._logger.log("debug", "(methodCallRPCoverXMPP) - sent.");
                that._logger.log("internal", "(methodCallRPCoverXMPP) - result : ", result);
                
                resolve(result);
            } catch (err) {
                that._logger.log("error", LOG_ID + "(methodCallRPCoverXMPP) Error.");
                that._logger.log("internalerror", LOG_ID + "(methodCallRPCoverXMPP) Error : ", err);
                return reject(err);
            }
        });
    }

    /**
     * @private
     * @method discover
     * @since 2.10.0
     * @instance
     * @async
     * @category Rainbow RPCoverXMPP RPC Client
     * @description
     *    This API allows to get the supported XMPP services. <br>
     * @return {Promise<any>} An object of the result
     */
    discover() {
        let that = this;

        return new Promise(async (resolve, reject) => {

            try {
                
                let result = await that._xmpp.discover();
                that._logger.log("debug", "(discover) - sent.");
                that._logger.log("internal", "(discover) - result : ", result);

                resolve(result);
            } catch (err) {
                that._logger.log("error", LOG_ID + "(discover) Error.");
                that._logger.log("internalerror", LOG_ID + "(discover) Error : ", err);
                return reject(err);
            }
        });
    }

    //endregion Rainbow RPCoverXMPP RPC Client

}

module.exports.RPCoverXMPPService = RPCoverXMPPService;
export {RPCoverXMPPService as RPCoverXMPPService};

