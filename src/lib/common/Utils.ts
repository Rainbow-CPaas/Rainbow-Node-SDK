"use strict";


const config = require ("../config/config");
import {atob} from "atob";
const Jimp = require('jimp');
const dns = require('dns')
const utilTypes = require('util').types
const xml2js = require('xml2js');

let makeId = (n) => {
  let text = "";
  let possible = "abcdefghijklmnopqrstuvwxyz0123456789";

  for (let i = 0; i < n; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }

  return text;
};

let createPassword = (size) => {
    let possible = ["ABCDEFGHIJKLMNOPQRSTUVWXYZ", "abcdefghijklmnopqrstuvwxyz", "?=.*[_~!@#\$%\^&\*\-\+=`\|\(\){}\[\]:;\"'<>,\.\?\/]", "0123456789"];
    let key = "";
    for (let i = 0; i < size - 4; i++) {
        let index = Math.floor(Math.random() * possible.length);
        key += possible[index].charAt(Math.floor(Math.random() * possible[index].length));
    }
    for (let i = 0; i < 4; i++) {
        key += possible[i].charAt(Math.floor(Math.random() * possible[i].length));
    }
    return key;
};

let isAdmin = ( roles ) => {
    return Array.isArray( roles ) && -1 !== roles.indexOf("admin");
};

class Deferred {
	public resolve: any;
	public reject: any;
	public promise: any;

    constructor() {
        let that = this;
        this.resolve = null;
        this.reject = null;
        this.promise = new Promise(function(resolve, reject) {
            that.resolve = resolve;
            that.reject = reject;
        }.bind(this));
        Object.freeze(this);
    }
}

let isSuperAdmin = (roles) => {
    return Array.isArray(roles) && roles.indexOf("superadmin") !== -1;
};

let anonymizePhoneNumber = function (number) {
    if (number === null || typeof number === "undefined") {
        return null;
    }
    if (config && config.debug === true) {
        return number;
    }
    let result = "";

    if (number.indexOf("+") === 0) {
        result = "+";
    }

    if (number.length > 4) {
        result = result + "*".repeat(number.length - 4 - result.length) + number.slice(number.length - 4);
    } else {
        result = number;
    }
    return result;
};

let equalIgnoreCase = function(s1: string, s2: string) {
    let regex = new RegExp('^' + s1 + '$', 'i');
    if (regex.test(s2)) {
        return true;
    } else {
        return false;
    }
}

let isNullOrEmpty = function(value) {
    let _isNullOrEmpty = true;
    if (value) {
        if (typeof (value) == 'string') {
            if (value.length > 0)
                _isNullOrEmpty = false;
        }
    }
    return _isNullOrEmpty;
}

let isNumber = function  isNumber(data) {
    return (typeof data === 'number' && !(isNaN(data)));
}

let setTimeoutPromised = function(timeOutMs) : Promise<any> {
    return new Promise((resolve, reject) => {
      setTimeout(()=> {
          try {
              resolve(undefined);
          } catch (err) {
              return reject(err);
          }
      }, timeOutMs);
    });
};

let pause = setTimeoutPromised;
/*let pause = function (timeToWaitMS) : Promise<any> {
    return setTimeoutPromised(timeToWaitMS);
} // */

/*
myFunction() in the original question can be modified as follows

async function myFunction(number) {

    let x=number;
...
... more initializations

    await until(_ => flag == true);

...
... do something

}
// */

//where until() is this utility function
/**
 * @description
 * function to wait for a condition for a few time before it is resolved of rejected.
 * To be used with asynchrone function :
 * myFunction() is the code using until function.
 *
 * async function myFunction(number) {
  *    let x=number;
 * ... more initializations
 *
 *    await until(_ => flag == true);
 * ...
 * ... do something when until is resolved/rejected
 * }
 *
 * @param conditionFunction
 * @returns {Promise<any>}
 */
function until(conditionFunction : Function, labelOfWaitingCondition : string, waitMsTimeBeforeReject : number = 5000) {

    let now = new Date();//.toJSON().replace(/-/g, '_');

    if (!waitMsTimeBeforeReject) {
        waitMsTimeBeforeReject = 1000 * 5; // wait 5 seconds
    }

    let end = new Date(now.getTime() + waitMsTimeBeforeReject);
    const poll = (resolve, reject) => {
        if (conditionFunction()) {
            resolve(undefined);
        } else  {
            if (new Date() > end ) {
                labelOfWaitingCondition  = labelOfWaitingCondition ? labelOfWaitingCondition : "";
                reject(new Error('ErrorManager the condition \'' + labelOfWaitingCondition + '\' failed'));
                //throw new ErrorManager('ErrorManager the condition ' + labelOfWaitingCondition ? labelOfWaitingCondition : "" + ' failed');
                return;
            }
            setTimeout(_ => poll(resolve, reject), 400);
        }
    };

    return new Promise(poll);
}

// function to treat a promise in an amount of time.
function doWithinInterval({promise, timeout, error}) {
    let timer = null;

    return Promise.race([
        new Promise((resolve, reject) => {
            function reject2() {
                return reject(error);
            }
            timer = setTimeout(reject2, timeout);
            return timer;
        }),
        promise.then((value) => {
            clearTimeout(timer);
            return value;
        })
    ]);
}

function orderByFilter(originalArray, filterFct, flag, sortFct) {
    let o = []

    let objectsCompared = [];

    if (!originalArray) {
        return [];
    }

    originalArray.forEach((objectOriginal, index) => {
        let tabOfArgForApply = [];
        tabOfArgForApply.push(objectOriginal);
        let objectComparing = {
            keyToCompare: null,
            objectOriginal: null
        } ;
        objectComparing.keyToCompare = filterFct.apply(null, tabOfArgForApply);
        objectComparing.objectOriginal = objectOriginal;
        objectsCompared.push(objectComparing);
        //that.waitingBotConversations.splice(index, 1);
    });

    function compWithkeyToCompare (objectComparingA, objectComparingB?) {
        return sortFct(objectComparingA.keyToCompare, objectComparingB.keyToCompare) ;
    }

    o = objectsCompared.sort(compWithkeyToCompare);
//        o = objs.sort(sortFct);

    let tabOrdered = [];

    o.forEach((objectCompared, index) => {
        tabOrdered.push(objectCompared.objectOriginal) ;
    });

    if (flag) {
        tabOrdered.reverse();
    } else {
        return tabOrdered;
    }
}

function addDaysToDate(date, days) {
    let result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
}

function addParamToUrl(urlParams : Array<string>, paramName : string, paramValue : any) {
    if (paramValue == undefined || paramValue == null) {
        return;
    } 
    if (paramName && urlParams) {
        if (urlParams[0].includes("?") ) {
            urlParams[0] += "&" ;
        } else {
            urlParams[0] += "?";
        }
        //urlParams[0] += urlParams[0] ? "&" : "?";
        urlParams[0] += paramName + "=" + encodeURIComponent(paramValue);
    }
}

function addPropertyToObj(objetToUpdate : Object, methodName : string, methodValue : any, addEmptyProperty: boolean = false) {
    if (!addEmptyProperty && ( methodValue === null || methodValue === undefined )) {
        return;
    } 
    if (objetToUpdate && methodName && (typeof objetToUpdate === "object" || typeof objetToUpdate === "function") ) {
        objetToUpdate[methodName] = methodValue;
    }
}

function cleanEmptyMembersFromObject(objParams : Object) {
    if (objParams) {
        for (let objParamsKey in objParams) {
            if (objParams[objParamsKey] == undefined || objParams[objParamsKey] == null) {
                delete objParams[objParamsKey];
            }
        }
    }
}

function  isStart_upService( serviceoptions) {
    let start_up = true;
    if (!serviceoptions.optional) {
        start_up = true;
    } else {
        start_up = !!serviceoptions.start_up;
    }
    return start_up;
}

function isStarted(_methodsToIgnoreStartedState: Array<string> = []) : any{
    return function (target, key, descriptor) : any {
        let keys = Object.getOwnPropertyNames(target.prototype);
        keys.forEach((propertyName)=> {
            const descriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyName);
            const isMethod = descriptor.value instanceof Function;
            if (!isMethod)
                return;

            // Keep the method store in a local variable
            const originalMethod = descriptor.value;
            descriptor.value = function (...args: any[]) {

                // Execute the method with its initial context and arguments
                // Return value is stored into a variable instead of being passed to the execution stack
                let returnValue = undefined;
                let methodsToIgnoreStartedState = ["start", "stop", "contructor", "attachHandlers", "getClassName", "cleanMemoryCache"] ;
                methodsToIgnoreStartedState = methodsToIgnoreStartedState.concat(_methodsToIgnoreStartedState[0]);
                let ignoreTheStartedState : boolean = (methodsToIgnoreStartedState.find((elt) => { return elt === propertyName; } ) != undefined);
                if (this == null) {
                    returnValue = originalMethod.apply(this, args);
                } else {
                    let logger = this.logger ? this.logger : this._logger ? this._logger : {};
                    let start_up = isStart_upService(this.startConfig);
                   /* if (propertyName==="getBubbleByJid" || propertyName==="getBubbleById") {
                        //logger.log("internal", LOG_ID + logger.colors.data("Method " + propertyName) + ", args ", args? "is defined" : "is not defined", ", this ", this ? "is defined" : "is NOT defined");
                        logger.log("internal", "LOG_ID" + logger.colors.data("isStarted "  + this.getClassName() + "::" + propertyName) + ", start_up : ", start_up, ", ignoreTheStartedState : ", ignoreTheStartedState, ", this._started : ", this._started);
                    } // */

                    if (ignoreTheStartedState) {
                        if (start_up) {
                            //logger.log("debug", LOG_ID + logger.colors.data("Method " + propertyName + "(...) _entering_"));
                            returnValue = originalMethod.apply(this, args);
                            //logger.log("debug", LOG_ID + logger.colors.data("Method " + propertyName + "(...) _exiting_"));
                        } else {
                            return Promise.resolve({msg: "The service of the Object " + target.name + " is not configured for start-up!!! Can not call method : " + propertyName});
                            //throw({msg: "The service of the Object " + target.name + " is not ready!!! Can not call method : " + propertyName});
                        }
                    } else {
                        if (start_up) {
                            if (this._started) {
                              //  logger.log("debug", LOG_ID + logger.colors.data("Method " + propertyName + "(...) _entering_"));
                                returnValue = originalMethod.apply(this, args);
                                //logger.log("debug", LOG_ID + logger.colors.data("Method " + propertyName + "(...) _exiting_"));
                            } else {
                                //return Promise.resolve({msg: "The service of the Object " + target.name + " is not ready!!! Can not call method : " + propertyName});
                                let error = {code : -1, msg: "The service of the Object " + target.name + " is not started!!! Can not call method : " + propertyName};
                                if (isPromise(originalMethod)) {
                                    error.code = 400;
                                    // returnValue = Promise.reject(error);
                                }
                                    //throw({msg: "The service of the Object " + target.name + " is not started!!! Can not call method : " + propertyName});
                                    throw(error);
                            }
                        } else {
                            returnValue = Promise.resolve({msg: "The service of the Object " + target.name + " is not configured for start-up!!! Can not call method : " + propertyName});
                        }
                    }
                }
                // Return back the value to the execution stack
                return returnValue;


                /* console.log("The method args are: " + JSON.stringify(args));
                const result = originalMethod.apply(this, args);
                console.log("The return value is: " + result);
                return result; // */
            };

            Object.defineProperty(target.prototype, propertyName, descriptor);
        });
    }
}

function logEntryExit(LOG_ID) : any {
    return function (target, key, descriptor): any {
        let keys = Object.getOwnPropertyNames(target.prototype);
        keys.forEach((propertyName) => {
            const descriptor = Object.getOwnPropertyDescriptor(target.prototype, propertyName);
            const isMethod = descriptor.value instanceof Function;
            if (!isMethod)
                return;

            // Keep the method store in a local variable
            const originalMethod = descriptor.value;
            descriptor.value = function (...args: any[]) {

                // Execute the method with its initial context and arguments
                // Return value is stored into a variable instead of being passed to the execution stack
                let returnValue = undefined;
                if (this==null || originalMethod.name==="getClassName" || propertyName==="getClassName") {
                    returnValue = originalMethod.apply(this, args);
                } else {
                    let logger = this.logger ? this.logger:this._logger ? this._logger:{log : ()=> {console.log( arguments);}, colors:{data : function (param) {return param} }};
                    try {

                        /* if (!this.getClassName) {
                             this.getClassName = function getClassName () { return "UNKNOWNCLASS"; };
                         } // */
                        logger.log("internal", LOG_ID + logger.colors.data("Method " + this.getClassName() + "::" + propertyName + "(...) _entering_"));
                        /*if (propertyName==="getBubbleByJid" || propertyName==="getBubbleById") {
                            //logger.log("internal", LOG_ID + logger.colors.data("Method " + propertyName) + ", args ", args? "is defined" : "is not defined", ", this ", this ? "is defined" : "is NOT defined");
                            logger.log("internal", LOG_ID + logger.colors.data("Method "  + this.getClassName() + "::" + propertyName) + ", args : ", args );
                            //logger.log("internal", LOG_ID + logger.colors.data("Method "  + this.getClassName() + "::" + propertyName) + ", args : ", args, ", this ", this.constructor.name );
                        } // */

                        returnValue = originalMethod.apply(this, args);
                        logger.log("internal", LOG_ID + logger.colors.data("Method " + this.getClassName() + "::" + propertyName + "(...) _exiting_"));
                    } catch (err) {
                        logger.log("error", LOG_ID + "(logEntryExit) CATCH Error !!! for ", logger.colors.data("Method " + this.getClassName() + "::" + propertyName), " error : ", err);
                        // let error = {msg: "The service of the Object " + target.name + " is not started!!! Can not call method : " + propertyName};
                        if (err.code == 400) {
                            returnValue = Promise.reject(err);
                        }
                    }
                }
                // Return back the value to the execution stack
                return returnValue;
            };
            Object.defineProperty(target.prototype, propertyName, descriptor);
        });
    }
}

/**
 * @private
 * @param avatarImg
 * @param maxWidth
 * @param maxHeight
 */
function resizeImage (avatarImg, maxWidth, maxHeight) {
    let that = this;
    //let logger = this.logger ? this.logger : this._logger ? this._logger : {};
    return new Promise((resolve, reject)=> {
        Jimp.read(avatarImg) // this can be url or local location
            .then(image => {
                // logger.log("debug", "(resizeImage) image : ", image);
                image.resize(maxHeight, maxWidth) // jimp.AUTO automatically sets the width so that the image doesnot looks odd
                    // @ts-ignore
                    .getBase64(Jimp.AUTO, (err, res) => {
                        // logger.log("debug", "(setAvatarBubble) getBase64 : ", res);
                        /*
                        const buf = new Buffer(
                            res.replace(/^data:image\/\w+;base64,/, ""),
                            "base64"
                        );
                        let data = {
                            Body: buf,
                            ContentEncoding: "base64",
                            ContentType: "image/jpeg"
                        };
                        // */
                        return resolve(res);
                    });
            })
            .catch(err => {
                console.log("error", "(resizeImage) Error : ", err);
            });
    });


    /*
    let defered = $q.defer();
    let image = new Image();
    image.src = avatarImg;

    image.onload = function() {
        let imageWidth = image.width;
        let imageHeight = image.height;

        if (imageWidth > imageHeight) {
            if (imageWidth > maxWidth) {
                imageHeight *= maxWidth / imageWidth;
                imageWidth = maxWidth;
            }
        }
        else {
            if (imageHeight > maxHeight) {
                imageWidth *= maxHeight / imageHeight;
                imageHeight = maxHeight;
            }
        }

        let canvas = document.createElement("canvas");
        canvas.width = imageWidth;
        canvas.height = imageHeight;
        image.width = imageWidth;
        image.height = imageHeight;
        let ctx = canvas.getContext("2d");
        ctx.drawImage(this, 0, 0, imageWidth, imageHeight);

        let resizedImage = new Image();
        resizedImage.src = canvas.toDataURL("image/png");
        defered.resolve(resizedImage);
    };
    return defered.promise;
    // */
}

/**
 * @private
 * @param image
 */
function getBinaryData (image) {
    let typeIndex = image.indexOf("image/") + 6;
    let binaryIndex = image.indexOf(";base64,");
    let binaryData = image.slice(binaryIndex + 8);
    let imageType = image.slice(typeIndex, binaryIndex);
    let binary_string = atob(binaryData);
    let len = binary_string.length;
    let bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) { bytes[i] = binary_string.charCodeAt(i); }
    return { type: imageType, data: bytes };
}

/**
 *
 * @param max The greater number which can be generated. If not defined the default value is 10.
 * @description
 *      generate an integer number between 1 and max value param.
 * @return {number} Return an integer number between 1 and max value param.
 */
function getRandomInt(max) {
    return Math.floor(Math.random() * Math.floor(max?max:10));
}

function stackTrace() {
    var err = new Error();
    return err.stack;
}

function isPromise (x) {
    let isProm = utilTypes.isPromise(x) || x.constructor.name === 'Promise' || x.constructor.name === 'AsyncFunction';
    return isProm ;
    //return Object(x).constructor===Promise;
}

const resolveDns = (cname) => {
    return new Promise(function (resolve, reject ) {
        const getIp = (accum) => {

           // console.log("(resolve) (getIp) param : ", accum);
            dns.resolve(cname, (err, result) => {
                if (err) {
                    //console.error(`error: ${err}`)
                    reject();
                } else {
                    result.push.apply(result, accum)
                    //console.log("(resolve) (getIp) result : ", result)
                    resolve (result);
                }
            })
        }

        let accum = []
        const getCnames = (err, result) => {
            if (err) {
                //console.log("(resolve) (getIp) error : ", err)
                // no more records
                getIp(accum)
            } else {
                //console.log("(resolve) (getIp) result : ", result)
                const cname = result[0]
                accum.push(cname)
                dns.resolveCname(cname, getCnames)
            }
        }

        dns.resolveCname(cname, getCnames)
    });
}

async function getJsonFromXML(xml : string) {
    try {
        const result = await xml2js.parseStringPromise(xml, {mergeAttrs: false, explicitArray : false, attrkey : "$attrs", emptyTag  : undefined});

        // convert it to a JSON string
        return result;
        //return JSON.stringify(result, null, 4);
    } catch (err) {
        //console.log(err);
        return {};
    }
}

function randomString(length, chars) {
    let result = "";
    for (let i = length; i > 0; --i) {
        result += chars[Math.round(Math.random() * (chars.length - 1))];
    }
    return result;
}

function generateRamdomEmail(email){
    let randomId = randomString(16, "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ");
    let emailGenerated = randomId + "_" + email;
    return emailGenerated.toLowerCase();
}

export let objToExport = {
    makeId,
    createPassword,
    isAdmin,
    anonymizePhoneNumber,
    equalIgnoreCase,
    isNullOrEmpty,
    isNumber,
    Deferred,
    isSuperAdmin,
    setTimeoutPromised,
    until,
    orderByFilter,
    isStart_upService,
    isStarted,
    logEntryExit,
    resizeImage,
    getBinaryData,
    getRandomInt,
    pause,
    stackTrace,
    addDaysToDate,
    addParamToUrl,
    cleanEmptyMembersFromObject,
    resolveDns,
    isPromise,
    doWithinInterval,
    addPropertyToObj,
    generateRamdomEmail,
    getJsonFromXML
};

module.exports = objToExport;
export {
    makeId,
    createPassword,
    isAdmin,
    anonymizePhoneNumber,
    equalIgnoreCase,
    isNullOrEmpty,
    isNumber,
    Deferred,
    isSuperAdmin,
    setTimeoutPromised,
    until,
    orderByFilter,
    isStart_upService,
    isStarted,
    logEntryExit,
    resizeImage,
    getBinaryData,
    getRandomInt,
    pause,
    stackTrace,
    addDaysToDate,
    addParamToUrl,
    cleanEmptyMembersFromObject,
    resolveDns,
    isPromise,
    doWithinInterval,
    addPropertyToObj,
    generateRamdomEmail,
    getJsonFromXML
};

export default {
    makeId,
    createPassword,
    isAdmin,
    anonymizePhoneNumber,
    equalIgnoreCase,
    isNullOrEmpty,
    isNumber,
    Deferred,
    isSuperAdmin,
    setTimeoutPromised,
    until,
    orderByFilter,
    isStart_upService,
    isStarted,
    logEntryExit,
    resizeImage,
    getBinaryData,
    getRandomInt,
    pause,
    stackTrace,
    addDaysToDate,
    addParamToUrl,
    cleanEmptyMembersFromObject,
    resolveDns,
    isPromise,
    doWithinInterval,
    addPropertyToObj,
    generateRamdomEmail,
    getJsonFromXML
};
