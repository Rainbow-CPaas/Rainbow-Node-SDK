"use strict";
import {logEntryExit, stackTrace} from "./common/Utils";

export {};

import {XMPPService} from "./connection/XMPPService";
import {RESTService} from "./connection/RESTService";
import {HTTPService} from "./connection/HttpService";
import {Logger} from "./common/Logger";
import {ImsService} from "./services/ImsService";
import {PresenceService} from "./services/PresenceService";
import {ChannelsService} from "./services/ChannelsService";
import {ContactsService} from "./services/ContactsService";
import {ConversationsService} from "./services/ConversationsService";
import {ProfilesService} from "./services/ProfilesService";
import {TelephonyService} from "./services/TelephonyService";
import {BubblesService} from "./services/BubblesService";
import {GroupsService} from "./services/GroupsService";
import {AdminService} from "./services/AdminService";
import {SettingsService} from "./services/SettingsService";
import {FileServerService} from "./services/FileServerService";
import {FileStorageService} from "./services/FileStorageService";
import {SDKSTATUSENUM, StateManager} from "./common/StateManager";
import {CallLogService} from "./services/CallLogService";
import {FavoritesService} from "./services/FavoritesService";
import {InvitationsService} from "./services/InvitationsService";
import {Events} from "./common/Events";
import {setFlagsFromString} from "v8";
import {Options} from "./config/Options";
import {ProxyImpl} from "./ProxyImpl";
import {ErrorManager} from "./common/ErrorManager";
import {AlertsService} from "./services/AlertsService";

import {lt} from "semver";
import {S2SService} from "./services/S2SService";
import {WebinarsService} from "./services/WebinarsService";
import {RBVoiceService} from "./services/RBVoiceService";

const packageVersion = require("../package.json");

let _signin;
let _retrieveInformation;

const LOG_ID = "CORE - ";

@logEntryExit(LOG_ID)
class Core {
	public _signin: any;
	public _retrieveInformation: any;
	public setRenewedToken: any;
	public onTokenRenewed: any;
	public logger: any;
	public _rest: RESTService;
	public onTokenExpired: any;
	public _eventEmitter: Events;
	public _tokenSurvey: any;
	public options: any;
	public _proxy: ProxyImpl;
	public _http: HTTPService;
	public _xmpp: XMPPService;
	public _stateManager: StateManager;
	public _im: ImsService;
	public _presence: PresenceService;
	public _channels: ChannelsService;
	public _contacts: ContactsService;
	public _conversations: ConversationsService;
	public _profiles: ProfilesService;
	public _telephony: TelephonyService;
	public _bubbles: BubblesService;
	public _groups: GroupsService;
	public _admin: AdminService;
	public _settings: SettingsService;
	public _fileServer: FileServerService;
	public _fileStorage: FileStorageService;
    public _calllog: CallLogService;
    public _favorites: FavoritesService;
    public _alerts: AlertsService;
    public _webinars: WebinarsService;
    public _rbvoice: RBVoiceService;
    public _invitations: InvitationsService;
	public _botsjid: any;
    public _s2s: S2SService;
    cleanningClassIntervalID: NodeJS.Timeout;

    static getClassName(){ return 'Core'; }
    getClassName(){ return Core.getClassName(); }

    constructor(options) {

        let self = this;

        self._signin = (forceStopXMPP, token) => {
            let that = self;
            that.logger.log("debug", LOG_ID + "(signin) _entering_");

            let json = null;

            return new Promise(function (resolve, reject) {

                if (that.options.useXMPP) {
                    return that._xmpp.stop(forceStopXMPP).then(() => {
                        return that._rest.signin(token);
                    }).then((_json) => {
                        json = _json;
                        let headers = {
                            "headers": {
                                // "Authorization": "Bearer " + that._rest.token,
                                "x-rainbow-client": "sdk_node",
                                "x-rainbow-client-version": packageVersion.version
                                // "Accept": accept || "application/json",
                            }
                        };
                        return that._xmpp.signin(that._rest.loggedInUser, headers);
                    }).then(function () {
                        that.logger.log("debug", LOG_ID + "(signin) signed in successfully");
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return resolve(json);
                    }).catch(function (err) {
                        that.logger.log("error", LOG_ID + "(signin) can't signed-in.");
                        that.logger.log("internalerror", LOG_ID + "(signin) can't signed-in", err);
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return reject(err);
                    });
                } else if (that.options.useS2S) {
                    return that._rest.signin(token).then(async (_json) => {
                        json = _json;
                        let headers = {
                            "headers": {
                                "Authorization": "Bearer " + that._rest.token,
                                "x-rainbow-client": "sdk_node",
                                "x-rainbow-client-version": packageVersion.version
                                // "Accept": accept || "application/json",
                            }
                        };

                        return that._s2s.signin(that._rest.loggedInUser, headers);
                    }).then(function () {
                        that.logger.log("debug", LOG_ID + "(signin) signed in successfully");
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return resolve(json);
                    }).catch(function (err) {
                        that.logger.log("error", LOG_ID + "(signin) can't signed-in.");
                        that.logger.log("internalerror", LOG_ID + "(signin) can't signed-in", err);
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return reject(err);
                    });
                } else {
                    that._rest.signin(token).then((_json) => {
                        json = _json;
                        let headers = {
                            "headers": {
                                "Authorization": "Bearer " + that._rest.token,
                                "x-rainbow-client": "sdk_node",
                                "x-rainbow-client-version": packageVersion.version
                                // "Accept": accept || "application/json",
                            }
                        };
                        that.logger.log("debug", LOG_ID + "(signin) signed in successfully");
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return resolve(json);
                    }).catch((err)=> {
                        that.logger.log("debug", LOG_ID + "(signin) signed failed : ", err);
                        that.logger.log("debug", LOG_ID + "(signin) _exiting_");
                        return reject(err);
                    });
                }
            });
        };

        self._retrieveInformation = () => {
            let that = self;
            that.logger.log("debug", LOG_ID + "(_retrieveInformation).");
            //that.logger.log("internal", LOG_ID + "(_retrieveInformation) options : ", that.options);
            return new Promise(async (resolve, reject) => {

                if (that.options.testOutdatedVersion) {
                    await that._rest.getRainbowNodeSdkPackagePublishedInfos().then((infos: any) => {
                        // self.logger.log("internal", LOG_ID +  "(getRainbowNodeSdkPackagePublishedInfos) infos : ", infos);
                        infos.results.forEach((packagePublished: any) => {
                            if (packagePublished.package.name === packageVersion.name) {
                                //if (packagePublished.package.version !== packageVersion.version) {
                                if (lt(packageVersion.version, packagePublished.package.version)) {
                                    self.logger.log("error", LOG_ID + "(getRainbowNodeSdkPackagePublishedInfos)  \n " +
                                        "*******************************************************\n\n", self.logger.colors.red.underline("WARNING : "), self.logger.colors.italic("\n  curent rainbow-node-sdk version : " + packageVersion.version + " is OLDER than the latest available one on npmjs.com : " + packagePublished.package.version + "\n  please update it (npm install rainbow-node-sdk@latest) and use the CHANGELOG to consider the changes."), "\n\n*******************************************************");
                                    let error = {
                                        "label": "curent rainbow-node-sdk version : " + packageVersion.version + " is OLDER than the latest available one on npmjs.com : " + packagePublished.package.version + " please update it (npm install rainbow-node-sdk@latest) and use the CHANGELOG to consider the changes.",
                                        "currentPackage": packageVersion.version,
                                        "latestPublishedPackage": packagePublished.package.version
                                    };
                                    self._eventEmitter.iee.emit("evt_internal_onrainbowversionwarning", error);

                                    //self.events.publish("rainbowversionwarning", error);
                                } else {
                                    self.logger.log("info", LOG_ID + "(_retrieveInformation) using the last published version of the SDK.");
                                }
                            }
                        });
                    }).catch((error) => {
                        self.logger.log("debug", LOG_ID + "(_retrieveInformation) getRainbowNodeSdkPackagePublishedInfos error : ", error);
                        // self.logger.log("internalerror", LOG_ID +  "(getRainbowNodeSdkPackagePublishedInfos) error : ", error);
                    });
                }

                if (that.options.useS2S) {
                    let result: Promise<any> = Promise.resolve(undefined);
                    if (that.options.imOptions.autoLoadContacts) {
                        result = that._contacts.getRosters();
                    } else {
                        that.logger.log("info", LOG_ID + "(_retrieveInformation) load of getRosters IGNORED by config autoLoadContacts : ", that.options.imOptions.autoLoadContacts);
                    }
                    return result
                            .then(() => {
                                return that._s2s.init();
                            }).then(() => {
                            return that._profiles.init();
                        }).then(() => {
                            return that._telephony.init();
                        }).then(() => {
                            return that._contacts.init();
                        }).then(() => {
                            return that._fileStorage.init();
                        }).then(() => {
                            return that._fileServer.init();
                        }).then(() => {
                            return that.presence._sendPresenceFromConfiguration();
                        }).then(() => {
                            return that._bubbles.getBubbles();
                        }).then(() => {
                            return that._channels.fetchMyChannels();
                            }).then(() => {
                                return that._admin.init();
                            }).then(() => {
                                return that._bubbles.init();
                            }).then(() => {
                                return that._channels.init();
                            }).then(() => {
                                return that._conversations.init();
                            }).then(() => {
                                return that._groups.init();
                            }).then(() => {
                                return that._presence.init();
                            }).then(() => {
                                return that._settings.init();
                        }).then(() => {
                            //return that.presence.sendInitialPresence();
                            return Promise.resolve(undefined);
                        }).then(() => {
                            //return that.im.enableCarbon();
                            return Promise.resolve(undefined);
                        }).then(() => {
                            return that._rest.getBots();
                        }).then((bots : any) => {
                            that._botsjid = bots ? bots.map((bot) => {
                                return bot.jid;
                            }) : [];
                            return Promise.resolve(undefined);
                        }).then(() => {
                            if (that.options.imOptions.autoLoadConversations) {
                                return that._conversations.getServerConversations();
                            } else {
                                that.logger.log("info", LOG_ID + "(_retrieveInformation) load of getServerConversations IGNORED by config autoLoadConversations : ", that.options.imOptions.autoLoadConversations);
                                return;
                            }
                        }).then(() => {
                            return that._calllog.init();
                        }).then(() => {
                            return that._favorites.init();
                        }).then(() => {
                            return that._alerts.init();
                        }).then(() => {
                            return that._rbvoice.init();
                        }).then(() => {
                            return that._webinars.init();
                        }).then(() => {
                            return that._invitations.init();
                        }).then(() => {
                            return that._s2s.listConnectionsS2S();
                        }).then(() => {
                            resolve(undefined);
                        }).catch((err) => {
                            that.logger.log("error", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services.");
                            that.logger.log("internalerror", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services : ", err);
                            reject(err);
                        });
                    //return resolve(undefined);
                }
                if (that.options.useCLIMode) {
                    return resolve(undefined);
                }
                if (that.options.useXMPP) {
                    let result: Promise<any> = Promise.resolve(undefined);
                    if (that.options.imOptions.autoLoadContacts) {
                        result = that._contacts.getRosters();
                    } else {
                        that.logger.log("info", LOG_ID + "(_retrieveInformation) load of getRosters IGNORED by config autoLoadContacts : ", that.options.imOptions.autoLoadContacts);
                    }
                    return result
                        .then(() => {
                            return that._s2s.init();
                        }).then(() => {
                            return that._profiles.init();
                        }).then(() => {
                            return that._telephony.init();
                        }).then(() => {
                            return that._contacts.init();
                        }).then(() => {
                            return that._fileStorage.init();
                        }).then(() => {
                            return that._fileServer.init();
                        }).then(() => {
                            return that.presence._sendPresenceFromConfiguration();
                        }).then(() => {
                            return that._bubbles.getBubbles();
                        }).then(() => {
                            return that._channels.fetchMyChannels();
                        }).then(() => {
                            return that._admin.init();
                        }).then(() => {
                            return that._bubbles.init();
                        }).then(() => {
                            return that._channels.init();
                        }).then(() => {
                            return that._conversations.init();
                        }).then(() => {
                            return that._groups.init();
                        }).then(() => {
                            return that._presence.init();
                        }).then(() => {
                            return that._settings.init();
                        }).then(() => {
                            //return that.presence.sendInitialPresence();
                            return Promise.resolve(undefined);
                        }).then(() => {
                            return that.im.init(that.options._imOptions.enableCarbon);
                        }).then(() => {
                            return that._rest.getBots();
                        }).then((bots: any) => {
                            that._botsjid = bots ? bots.map((bot) => {
                                return bot.jid;
                            }) : [];
                            return Promise.resolve(undefined);
                        }).then(() => {
                            if (that.options.imOptions.autoLoadConversations) {
                                return that._conversations.getServerConversations();
                            } else {
                                that.logger.log("info", LOG_ID + "(_retrieveInformation) load of getServerConversations IGNORED by config autoLoadConversations : ", that.options.imOptions.autoLoadConversations);
                                return;
                            }
                        }).then(() => {
                            return that._calllog.init();
                        }).then(() => {
                            return that._favorites.init();
                        }).then(() => {
                            return that._alerts.init();
                        }).then(() => {
                            return that._rbvoice.init();
                        }).then(() => {
                            return that._webinars.init();
                        }).then(() => {
                            return that._invitations.init();
                        }).then(() => {
                            resolve(undefined);
                        }).catch((err) => {
                            that.logger.log("error", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services.");
                            that.logger.log("internalerror", LOG_ID + "(_retrieveInformation) !!! CATCH  Error while initializing services : ", err);
                            reject(err);
                        });
                }
            });
        };

        self.setRenewedToken = async (strToken : string) => {
            self.logger.log("info", LOG_ID +  "(setRenewedToken) strToken : ", strToken);
            return await self._rest.signin(strToken).then(() => {
                self.logger.log("info", LOG_ID +  "(setRenewedToken) token successfully renewed, send evt_internal_tokenrenewed event");
                self._eventEmitter.iee.emit("evt_internal_tokenrenewed");                
            });
            //return await self.signin(false, strToken);
        }
        
        self.onTokenRenewed = function onTokenRenewed() {
            self.logger.log("info", LOG_ID +  "(onTokenRenewed) token successfully renewed");
            self._rest.startTokenSurvey();
        };

        self.onTokenExpired = function onTokenExpired() {
            self.logger.log("info", LOG_ID +  "(onTokenExpired) token expired. Signin required");
/*
            self._eventEmitter.iee.removeListener("evt_internal_tokenrenewed", self.onTokenRenewed.bind(self));
            self._eventEmitter.iee.removeListener("evt_internal_tokenexpired", self.onTokenExpired.bind(self));
*/
            if (!self._rest.p_decodedtokenRest || ( self._rest.p_decodedtokenRest && ! self._rest.p_decodedtokenRest.oauth)) {
                self._eventEmitter.iee.emit("evt_internal_signinrequired");
            } else {
                self.logger.log("info", LOG_ID +  "(onTokenExpired) oauth token expired. Extarnal renew required");
                self._eventEmitter.iee.emit("evt_internal_onusertokenrenewfailed");
            }
        };

        self._tokenSurvey = () => {
            let that = self;
            that.logger.log("debug", LOG_ID +  "(tokenSurvey) _enter_");

            if (that.options.useCLIMode) {
                that.logger.log("info", LOG_ID +  "(tokenSurvey) No token survey in CLI mode");
                return;
            }

/*
            that._eventEmitter.iee.removeListener("evt_internal_tokenrenewed", that.onTokenRenewed.bind(that));
            that._eventEmitter.iee.removeListener("evt_internal_tokenexpired", that.onTokenExpired.bind(that));
            that._eventEmitter.iee.on("evt_internal_tokenrenewed", that.onTokenRenewed.bind(that));
            that._eventEmitter.iee.on("evt_internal_tokenexpired", that.onTokenExpired.bind(that));
*/
            that._rest.startTokenSurvey();
        };


        // Initialize the logger
        let loggerModule = new Logger(options);
        self.logger = loggerModule.log;

        // Initialize the Events Emitter
        self._eventEmitter = new Events(self.logger, (jid) => {
            return self._botsjid.includes(jid);
        });
        self._eventEmitter.setCore(self);

        loggerModule.logEventEmitter = self._eventEmitter.logEmitter;

        self.logger.log("debug", LOG_ID + "(constructor) _entering_");
        self.logger.log("debug", LOG_ID + "(constructor) ------- SDK INFORMATION -------");

        self.logger.log("info", LOG_ID + " (constructor) SDK version: " + packageVersion.version);
        self.logger.log("info", LOG_ID + " (constructor) Node version: " + process.version);
        for (let key in process.versions) {
            self.logger.log("info", LOG_ID + " (constructor) " + key + " version: " + process.versions[key]);
        }
        self.logger.log("debug", LOG_ID + "(constructor) ------- SDK INFORMATION -------");

        // Initialize the options

        self.options = new Options(options, self.logger);
        self.options.parse();

        self.logger.log("internal", LOG_ID + "(constructor) options : ", self.options);


        self._eventEmitter.iee.on("evt_internal_signinrequired", async() => {
            await self.signin(true, undefined);
        });
        self._eventEmitter.iee.on("rainbow_application_token_updated", function (token) {
            self._rest.applicationToken = token;
        });

        self._eventEmitter.iee.on("evt_internal_xmppfatalerror", async (err) => {
            console.log("Error XMPP, Stop le SDK : ", err);
            self.logger.log("error", LOG_ID + " (evt_internal_xmppfatalerror) Error XMPP, Stop le SDK : ", err);
            await self._stateManager.transitTo(self._stateManager.ERROR, err);
            await self.stop().then(function(result) {
                //let success = ErrorManager.getErrorManager().OK;
            }).catch(function(err) {
                let error = ErrorManager.getErrorManager().ERROR;
                error.msg = err;
                self.events.publish("stopped", error);
            });
        });

        self._eventEmitter.iee.on("rainbow_xmppreconnected", function () {
            let that = self;
            self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) received, so start reconnect from RESTService.");
            self._rest.reconnect().then((data) => {
                self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) reconnect succeed : so change state to connected");
                self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) reconnect succeed : ", data, " so change state to connected");
                return self._stateManager.transitTo(self._stateManager.CONNECTED).then((data2) => {
                    self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) transition to connected succeed.");
                    self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) transition to connected succeed : ", data2);
                    return self._retrieveInformation();
                });
            }).then((data3) => {
                self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) _retrieveInformation succeed, change state to ready");
                self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) _retrieveInformation succeed : ", data3,  " change state to ready");
                self._stateManager.transitTo(self._stateManager.READY).then((data4) => {
                    self.logger.log("info", LOG_ID + " (rainbow_xmppreconnected) transition to ready succeed.");
                    self.logger.log("internal", LOG_ID + " (rainbow_xmppreconnected) transition to ready succeed : ", data4);
                });
            }).catch(async (err) => {
                // If not already connected, it is an error in xmpp connection, so should failed
                if (!self._stateManager.isCONNECTED()) {
                    self.logger.log("error", LOG_ID + " (rainbow_xmppreconnected) REST connection ", self._stateManager.FAILED);
                    self.logger.log("internalerror", LOG_ID + " (rainbow_xmppreconnected) REST connection ", self._stateManager.FAILED, ", ErrorManager : ", err);
                    await self._stateManager.transitTo(self._stateManager.FAILED);
                } else {
                    if (err && err.errorname == "reconnectingInProgress") {
                        self.logger.log("warn", LOG_ID + " (rainbow_xmppreconnected) REST reconnection already in progress ignore error : ", err);
                    } else {
                        self.logger.log("warn", LOG_ID + " (rainbow_xmppreconnected) REST reconnection Error, set state : ", self._stateManager.DISCONNECTED);
                        self.logger.log("internalerror", LOG_ID + " (rainbow_xmppreconnected) REST reconnection ErrorManager : ", err, ", set state : ", self._stateManager.DISCONNECTED);
                        // ErrorManager in REST micro service, so let say it is disconnected
                        await self._stateManager.transitTo(self._stateManager.DISCONNECTED);
                        // relaunch the REST connection.
                        self._eventEmitter.iee.emit("rainbow_xmppreconnected");
                    }
                }
            });
        });

        self._eventEmitter.iee.on("rainbow_xmppreconnectingattempt", async function () {
            await self._stateManager.transitTo(self._stateManager.RECONNECTING);
        });

        self._eventEmitter.iee.on("rainbow_xmppdisconnect", async function (xmppDisconnectInfos) {
            if (xmppDisconnectInfos && xmppDisconnectInfos.reconnect) {
                self.logger.log("info", LOG_ID + " (rainbow_xmppdisconnect) set to state : ", self._stateManager.DISCONNECTED);
                await self._stateManager.transitTo(self._stateManager.DISCONNECTED);
            }  else {
                self.logger.log("info", LOG_ID + " (rainbow_xmppdisconnect) set to state : ", self._stateManager.STOPPED);
                await self._stateManager.transitTo(self._stateManager.STOPPED);
            }
        });

        self._eventEmitter.iee.on("evt_internal_tokenrenewed", self.onTokenRenewed.bind(self));
        self._eventEmitter.iee.on("evt_internal_tokenexpired", self.onTokenExpired.bind(self));

        if (self.options.useXMPP) {
            self.logger.log("info", LOG_ID + "(constructor) used in XMPP mode");
        }
        else {
            if (self.options.useCLIMode) {
                self.logger.log("info", LOG_ID + "(constructor) used in CLI mode");
            }
            else {
                self.logger.log("info", LOG_ID + "(constructor) used in HOOK mode");
            }
        }

        // Instantiate basic service
        self._proxy = new ProxyImpl(self.options.proxyOptions, self.logger);
        self._http = new HTTPService(self.options, self.logger, self._proxy, self._eventEmitter.iee, this);
        self._rest = new RESTService(self.options, self._eventEmitter.iee, self.logger, this);
        self._xmpp = new XMPPService(self.options.xmppOptions, self.options.imOptions, self.options.applicationOptions, self._eventEmitter.iee, self.logger, self._proxy);
        self._s2s = new S2SService(self.options.s2sOptions, self.options.imOptions, self.options.applicationOptions, self._eventEmitter.iee, self.logger, self._proxy,self.options.servicesToStart.s2s);

        // Instantiate State Manager
        self._stateManager = new StateManager(self._eventEmitter, self.logger);

        // Instantiate others Services
        self._im = new ImsService(self._eventEmitter.iee, self.logger, self.options.imOptions, self.options.servicesToStart.im);
        self._presence = new PresenceService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.presence);
        self._channels = new ChannelsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.channels);
        self._contacts = new ContactsService(self._eventEmitter.iee, self.options.httpOptions, self.logger, self.options.servicesToStart.contacts);
        self._conversations = new ConversationsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.conversations, self.options.imOptions.conversationsRetrievedFormat, self.options.imOptions.nbMaxConversations, self.options.imOptions.autoLoadConversations);
        self._profiles = new ProfilesService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.profiles);
        self._telephony = new TelephonyService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.telephony);
        self._bubbles = new BubblesService(self._eventEmitter.iee, self.options.httpOptions,self.logger, self.options.servicesToStart.bubbles);
        self._groups = new GroupsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.groups);
        self._admin = new AdminService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.admin);
        self._settings = new SettingsService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.settings);
        self._fileServer = new FileServerService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.fileServer);
        self._fileStorage = new FileStorageService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.fileStorage);
        self._calllog = new CallLogService(self._eventEmitter.iee, self.logger, self.options.servicesToStart.calllog);
        self._favorites = new FavoritesService(self._eventEmitter.iee,self.logger, self.options.servicesToStart.favorites);
        self._alerts = new AlertsService(self._eventEmitter.iee,self.logger, self.options.servicesToStart.alerts);
        self._rbvoice = new RBVoiceService(self._eventEmitter.iee, self.options.httpOptions, self.logger, self.options.servicesToStart.rbvoice);
        self._webinars = new WebinarsService(self._eventEmitter.iee, self.options.httpOptions, self.logger, self.options.servicesToStart.webinar);
        self._invitations = new InvitationsService(self._eventEmitter.iee,self.logger, self.options.servicesToStart.invitation);

        self._botsjid = [];

        self.startCleanningInterval();
        self.logger.log("debug", LOG_ID + "(constructor) _exiting_");
    }

    startCleanningInterval() {
        let that = this;
        function cleanningClass() {
            that.logger.log("debug", LOG_ID + "(startCleanningInterval) cleanningClass.");


            //public _rest: RESTService;
            //public _http: HTTPService;
            //public _xmpp: XMPPService;
            //public _stateManager: StateManager;
            //public _im: ImsService;

            that._admin.cleanMemoryCache();
            that._alerts.cleanMemoryCache();
            that._rbvoice.cleanMemoryCache();
            that._webinars.cleanMemoryCache();
            that._bubbles.cleanMemoryCache();
            that._calllog.cleanMemoryCache();
            that._channels.cleanMemoryCache();
            that._contacts.cleanMemoryCache();
            that._conversations.cleanMemoryCache();
            that._favorites.cleanMemoryCache();
            that._fileServer.cleanMemoryCache();
            that._fileStorage.cleanMemoryCache();
            that._groups.cleanMemoryCache();
            that._invitations.cleanMemoryCache();
            that._presence.cleanMemoryCache();
            that._profiles.cleanMemoryCache();
            that._s2s.cleanMemoryCache();
            that._settings.cleanMemoryCache();
            that._telephony.cleanMemoryCache();
        }        
        
        that.cleanningClassIntervalID = setInterval(cleanningClass, that.options.intervalBetweenCleanMemoryCache);
    }
    
    start(token) {
        let that = this;

        this.logger.log("debug", LOG_ID + "(start) _entering_");
        this.logger.log("info", LOG_ID + "(start) STARTING the SDK : ", packageVersion.version);

        return new Promise(function (resolve, reject) {

            try {

                if (!that.options.hasCredentials && !token) {
                    that.logger.log("error", LOG_ID + "(start) No credentials. Stop loading...");
                    that.logger.log("debug", LOG_ID + "(start) _exiting_");
                    reject("Credentials are missing. Check your configuration!");
                } else {
                    if (token) {
                        that.logger.log("debug", LOG_ID + "(start) with token.");
                        that.logger.log("internal", LOG_ID + "(start) with token : ", token);                        
                    }

                    that.logger.log("debug", LOG_ID + "(start) start all modules");
                    if (!token) {
                        that.logger.log("internal", LOG_ID + "(start) start all modules for user : ", that.options.credentials.login);
                    }
                    that.logger.log("internal", LOG_ID + "(start) servicesToStart : ", that.options.servicesToStart);
                    return that._stateManager.start().then(() => {
                        return that._http.start();
                    }).then(() => {
                        return that._rest.start(that._http);
                    }).then(() => {
                        return that._xmpp.start(that.options.useXMPP);
                    }).then(() => {
                        return that._s2s.start(that.options, that);
                    }).then(() => {
                        return that._settings.start(that.options, that);
                    }).then(() => {
                        return that._presence.start(that.options,that) ;
                    }).then(() => {
                        return  that._contacts.start(that.options, that ) ;
                    }).then(() => {
                       return that._bubbles.start(that.options, that) ;
                    }).then(() => {
                        return that._conversations.start(that.options, that) ;
                    }).then(() => {
                        return that._profiles.start(that.options, that, []) ;
                    }).then(() => {
                        return that._telephony.start(that.options, that) ;
                    }).then(() => {
                        return that._im.start(that.options, that) ;
                    }).then(() => {
                        return that._channels.start(that.options, that) ;
                    }).then(() => {
                        return that._groups.start(that.options, that) ;
                    }).then(() => {
                        return that._admin.start(that.options,that) ;
                    }).then(() => {
                        return that._fileServer.start(that.options, that) ;
                    }).then(() => {
                        return that._fileStorage.start(that.options, that) ;
                    }).then(() => {
                        return that._calllog.start(that.options, that) ;
                    }).then(() => {
                        return that._favorites.start(that.options, that) ;
                    }).then(() => {
                        return that._alerts.start(that.options, that) ; 
                    }).then(() => {
                        return that._rbvoice.start(that.options, that) ;
                    }).then(() => {
                        return that._webinars.start(that.options, that) ;
                    }).then(() => {
                        return that._invitations.start(that.options, that, []) ;
                    }).then(() => {
                        that.logger.log("debug", LOG_ID + "(start) all modules started successfully");
                        that._stateManager.transitTo(that._stateManager.STARTED).then(() => {
                            that.logger.log("debug", LOG_ID + "(start) _exiting_");
                            resolve(undefined);
                        }).catch((err) => {
                            reject(err);
                        });
                    }).catch((err) => {
                        that.logger.log("error", LOG_ID + "(start) !!! CATCH Error during bulding services instances.");
                        that.logger.log("internalerror", LOG_ID + "(start) !!! CATCH Error during bulding services instances : ", err);
                        that.logger.log("debug", LOG_ID + "(start) _exiting_");
                        reject(err);
                    });
                }

            } catch (err) {
                that.logger.log("error", LOG_ID + "(start)");
                that.logger.log("internalerror", LOG_ID + "(start)", err.message);
                that.logger.log("debug", LOG_ID + "(start) _exiting_");
                reject(err);
            }
        });
    }

    signin(forceStopXMPP, token) {

        let that = this;
        return new Promise(function (resolve, reject) {

            let json = null;

            return that._signin(forceStopXMPP, token).then(function (_json) {
                json = _json;
                that._tokenSurvey();
                return that._stateManager.transitTo(that._stateManager.CONNECTED).then(() => {
                    return that._retrieveInformation();
                });
            }).then(() => {
                that._stateManager.transitTo(that._stateManager.READY).then(() => {
                    resolve(json);
                }).catch((err)=> { 
                    reject(err); 
                });
            }).catch((err) => {
                reject(err);
            });
        });
    }

    stop() {
        let that = this;
        this.logger.log("internal", LOG_ID + "(stop) _entering_ stack : ", stackTrace());
        
        return new Promise(async function (resolve, reject) {

            if (that._stateManager.isSTOPPED()) {
                return resolve ("core already stopped !");
            }

            that.logger.log("debug", LOG_ID + "(stop) stop all modules !");

            await that._s2s.stop().then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped s2s.");
                return that._rest.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped rest");
                return that._http.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped http");
                return that._xmpp.stop(that.options.useXMPP);
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped xmpp");
                return that._im.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped im");
                return that._settings.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped settings");
                return that._presence.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped presence");
                return that._conversations.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped conversations");
                return that._telephony.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped telephony");
                return that._contacts.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped contacts");
                return that._bubbles.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped bubbles");
                return that._channels.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped channels");
                return that._groups.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped groups");
                return that._admin.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped admin");
                return that._fileServer.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped fileServer");
                return that._fileStorage.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped fileStorage");
                return that._stateManager.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped stateManager");
                return that._calllog.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped calllog");
                return that._favorites.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped favorites");
                return that._alerts.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped alerts");
                return that._rbvoice.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped rbvoice");
                return that._webinars.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped webinar");
                return that._invitations.stop();
            }).then(() => {
                that.logger.log("debug", LOG_ID + "(stop) stopped invitations");
                that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                resolve("core stopped");
            }).catch((err) => {
                that.logger.log("error", LOG_ID + "(stop) CATCH Error !!! ");
                that.logger.log("internalerror", LOG_ID + "(stop) CATCH Error !!! : ", err);
                that.logger.log("debug", LOG_ID + "(stop) _exiting_");
                reject(err);
            });
            // that.logger.log("debug", LOG_ID + "(stop) stop after all modules 1 !");
            that.logger.stop();
        });
        // that.logger.log("debug", LOG_ID + "(stop) stop after all modules 2 !");
    }

    async getConnectionStatus():Promise<{
        restStatus:boolean,
        xmppStatus:boolean,
        s2sStatus:boolean,
        state : SDKSTATUSENUM,
        nbHttpAdded : number,
        httpQueueSize : number,
        nbRunningReq : number,
        maxSimultaneousRequests : number
        nbReqInQueue : number
    }>{
        let that = this;
        let restStatus : boolean = false;
        // Test XMPP connection
        let xmppStatus : boolean = false;
        // Test S2S connection
        let s2sStatus : boolean = false;

        return new Promise(async(resolve, reject) => {
           // Test REST connection
            restStatus = await that._rest.checkRESTAuthentication();
           // Test XMPP connection
            xmppStatus = await this._xmpp.sendPing().then((result) => {
                that.logger.log("debug", LOG_ID + "(getConnectionStatus) set xmppStatus to true. result : ", result);
                if (result && result.code === 1) {
                    return true;
                } else {
                    return false;
                }
            });

            // */
           // Test S2S connection
            s2sStatus  = await that._rest.checkS2SAuthentication();

            let httpStatus = await that._http.checkHTTPStatus();

            return resolve({
                restStatus,
                xmppStatus,
                s2sStatus,
                state : that.state,
                nbHttpAdded : httpStatus.nbHttpAdded ,
                httpQueueSize : httpStatus.httpQueueSize ,
                nbRunningReq : httpStatus.nbRunningReq,
                maxSimultaneousRequests : httpStatus.maxSimultaneousRequests,
                nbReqInQueue: httpStatus.nbReqInQueue
            });
        });
    }

    get settings() {
        return this._settings;
    }

    get presence() {
        return this._presence;
    }

    get profiles() {
        return this._profiles;
    }

    get im() {
        return this._im;
    }

    get invitations() {
        return this._invitations;
    }

    get contacts() {
        return this._contacts;
    }

    get conversations() {
        return this._conversations;
    }

    get channels() {
        return this._channels;
    }

    get bubbles() {
        return this._bubbles;
    }

    get groups() {
        return this._groups;
    }

    get admin() {
        return this._admin;
    }

    get fileServer() {
        return this._fileServer;
    }

    get fileStorage() {
        return this._fileStorage;
    }

    get events() {
        return this._eventEmitter;
    }

    get rest() {
        return this._rest;
    }

    get state() {
        return this._stateManager.state;
    }

    get version() {
        return packageVersion.version;
    }

    get telephony() {
        return this._telephony;
    }

    get calllog() {
        return this._calllog;
    }
}

//module.exports = Core;
module.exports.Core = Core;
export {Core};
