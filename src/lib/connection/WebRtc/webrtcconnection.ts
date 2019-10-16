'use strict';

import {RTCPeerConnection as DefaultRTCPeerConnection} from "wrtc";
import {RTCIceCandidate} from "wrtc";
import  {ConnectionWebRtc} from './connectionwebrtc';
import {publicDecrypt} from "crypto";

const TIME_TO_CONNECTED = 10000;
const TIME_TO_HOST_CANDIDATES = 3000;  // NOTE(mroberts): Too long.
const TIME_TO_RECONNECTED = 10000;

class WebRtcConnection extends ConnectionWebRtc {
  get peerConnection(): any {
    return this._peerConnection;
  }
  public doOffer: () => Promise<void>;
  public applyAnswer: (answer) => Promise<void>;
  public createAnswer: () => void;
  public close: () => void;
  public toJSON: () => any;
  private addIceCandidate: (answer : RTCIceCandidate) => Promise<void>;
  private _peerConnection : any;


    constructor(id, options : any = {}) {
    super(id);

    let that = this;

    options = {
      RTCPeerConnection: DefaultRTCPeerConnection,
      beforeOffer(peerConnection: any) {},
      clearTimeout,
      setTimeout,
      timeToConnected: TIME_TO_CONNECTED,
      timeToHostCandidates: TIME_TO_HOST_CANDIDATES,
      timeToReconnected: TIME_TO_RECONNECTED,
      ...options
    };

    const {
      RTCPeerConnection,
      beforeOffer,
      timeToConnected,
      timeToReconnected
    }  = options;

      that._peerConnection = new RTCPeerConnection({
      sdpSemantics: 'unified-plan'
      //sdpSemantics: 'plan-b'
    });

    options.beforeOffer.beforeOffer(that._peerConnection);

    let connectionTimer = options.setTimeout(() => {
      if (that._peerConnection.iceConnectionState !== 'connected'
        && that._peerConnection.iceConnectionState !== 'completed') {
        this.close();
      }
    }, timeToConnected);

    let reconnectionTimer = null;

    const onIceConnectionStateChange = () => {
      if (that._peerConnection.iceConnectionState === 'connected'
        || that._peerConnection.iceConnectionState === 'completed') {
        if (connectionTimer) {
          options.clearTimeout(connectionTimer);
          connectionTimer = null;
        }
        options.clearTimeout(reconnectionTimer);
        reconnectionTimer = null;
      } else if (that._peerConnection.iceConnectionState === 'disconnected'
        || that._peerConnection.iceConnectionState === 'failed') {
        if (!connectionTimer && !reconnectionTimer) {
          const self = this;
          reconnectionTimer = options.setTimeout(() => {
            self.close();
          }, timeToReconnected);
        }
      }
    };

      that._peerConnection.addEventListener('iceconnectionstatechange', onIceConnectionStateChange);

    this.doOffer = async () => {
      const offer = await that._peerConnection.createOffer();

      //disableTrickleIce();
      await that._peerConnection.setLocalDescription(offer);
      try {
        await waitUntilIceGatheringStateComplete(that._peerConnection, options);
      } catch (error) {
        this.close();
        throw error;
      }
    };

    this.applyAnswer = async answer => {
      await that._peerConnection.setRemoteDescription(answer);
    };


      this.createAnswer = async function () {
          const originalAnswer = await that._peerConnection.createAnswer();
          /*
          const updatedAnswer = new RTCSessionDescription({
              type: 'answer',
              sdp: stereo ? enableStereoOpus(originalAnswer.sdp) : originalAnswer.sdp
          }); // */
          await that._peerConnection.setLocalDescription(originalAnswer);
      };

    this.addIceCandidate = async candidate => {
        return await that._peerConnection.addIceCandidate(candidate).catch((err)=> {
            console.log("addIceCandidate error : ", err);
        });
    };


      this.close = () => {
        that._peerConnection.removeEventListener('iceconnectionstatechange', onIceConnectionStateChange);
      if (connectionTimer) {
        options.clearTimeout(connectionTimer);
        connectionTimer = null;
      }
      if (reconnectionTimer) {
        options.clearTimeout(reconnectionTimer);
        reconnectionTimer = null;
      }
        that._peerConnection.close();
      super.close();
    };

    this.toJSON = () => {
      return {
        ...super.toJSON(),
        iceConnectionState: this.iceConnectionState,
        localDescription: this.localDescription,
        remoteDescription: this.remoteDescription,
        signalingState: this.signalingState
      };
    };

    Object.defineProperties(this, {
      iceConnectionState: {
        get() {
          return that._peerConnection.iceConnectionState;
        }
      },
      localDescription: {
        get() {
          return descriptionToJSON(that._peerConnection.localDescription, true);
        }
      },
      remoteDescription: {
        get() {
          return descriptionToJSON(that._peerConnection.remoteDescription, false);
        }
      },
      signalingState: {
        get() {
          return that._peerConnection.signalingState;
        }
      }
    });
  }
}

function descriptionToJSON(description, shouldDisableTrickleIce) {
  return !description ? {} : {
    type: description.type,
    sdp: shouldDisableTrickleIce ? disableTrickleIce(description.sdp) : description.sdp
  };
}

function disableTrickleIce(sdp) {
  return sdp.replace(/\r\na=ice-options:trickle/g, '');
}

async function waitUntilIceGatheringStateComplete(peerConnection, options) {
  if (peerConnection.iceGatheringState === 'complete') {
    return;
  }

  const { timeToHostCandidates } = options;

  const deferred : any = {};
  deferred.promise = new Promise((resolve, reject) => {
    deferred.resolve = resolve;
    deferred.reject = reject;
  });

  const timeout = options.setTimeout(() => {
    peerConnection.removeEventListener('icecandidate', onIceCandidate);
    deferred.reject(new Error('Timed out waiting for host candidates'));
  }, timeToHostCandidates);

  function onIceCandidate({ candidate }) {
    if (!candidate) {
      options.clearTimeout(timeout);
      peerConnection.removeEventListener('icecandidate', onIceCandidate);
      deferred.resolve();
    }
  }

  peerConnection.addEventListener('icecandidate', onIceCandidate);

  await deferred.promise;
}

module.exports.WebRtcConnection = WebRtcConnection;
export {WebRtcConnection};
