/**
 * Fake XDomainRequest object
 */

"use strict";

var event = require("./event");
var extend = require("./core/extend");
var configureLogError = require("./core/log_error");

var xdr = { XDomainRequest: global.XDomainRequest };
xdr.GlobalXDomainRequest = global.XDomainRequest;
xdr.supportsXDR = typeof xdr.GlobalXDomainRequest !== "undefined";
xdr.workingXDR = xdr.supportsXDR ? xdr.GlobalXDomainRequest : false;

function FakeXDomainRequest(config) {
    this.readyState = FakeXDomainRequest.UNSENT;
    this.requestBody = null;
    this.requestHeaders = {};
    this.status = 0;
    this.timeout = null;
    this.logError = configureLogError(config);

    if (typeof FakeXDomainRequest.onCreate === "function") {
        FakeXDomainRequest.onCreate(this);
    }
}

function verifyState(x) {
    if (x.readyState !== FakeXDomainRequest.OPENED) {
        throw new Error("INVALID_STATE_ERR");
    }

    if (x.sendFlag) {
        throw new Error("INVALID_STATE_ERR");
    }
}

function verifyRequestSent(x) {
    if (x.readyState === FakeXDomainRequest.UNSENT) {
        throw new Error("Request not sent");
    }
    if (x.readyState === FakeXDomainRequest.DONE) {
        throw new Error("Request done");
    }
}

function verifyResponseBodyType(body) {
    if (typeof body !== "string") {
        var error = new Error("Attempted to respond to fake XDomainRequest with " +
                            body + ", which is not a string.");
        error.name = "InvalidBodyException";
        throw error;
    }
}

extend(FakeXDomainRequest.prototype, event.EventTarget, {
    open: function open(method, url) {
        this.method = method;
        this.url = url;

        this.responseText = null;
        this.sendFlag = false;

        this.readyStateChange(FakeXDomainRequest.OPENED);
    },

    readyStateChange: function readyStateChange(state) {
        this.readyState = state;
        var eventName = "";
        switch (this.readyState) {
            case FakeXDomainRequest.UNSENT:
                break;
            case FakeXDomainRequest.OPENED:
                break;
            case FakeXDomainRequest.LOADING:
                if (this.sendFlag) {
                    //raise the progress event
                    eventName = "onprogress";
                }
                break;
            case FakeXDomainRequest.DONE:
                if (this.isTimeout) {
                    eventName = "ontimeout";
                } else if (this.errorFlag || this.status === 0) {
                    eventName = "onerror";
                } else {
                    eventName = "onload";
                }
                break;
            default:
                throw new Error("Unhandled state");
        }

        // raising event (if defined)
        if (eventName) {
            if (typeof this[eventName] === "function") {
                try {
                    this[eventName]();
                } catch (e) {
                    this.logError("Fake XHR " + eventName + " handler", e);
                }
            }
        }
    },

    send: function send(data) {
        verifyState(this);

        if (!/^(head)$/i.test(this.method)) {
            this.requestBody = data;
        }
        this.requestHeaders["Content-Type"] = "text/plain;charset=utf-8";

        this.errorFlag = false;
        this.sendFlag = true;
        this.readyStateChange(FakeXDomainRequest.OPENED);

        if (typeof this.onSend === "function") {
            this.onSend(this);
        }
    },

    abort: function abort() {
        this.aborted = true;
        this.responseText = null;
        this.errorFlag = true;

        if (this.readyState > FakeXDomainRequest.UNSENT && this.sendFlag) {
            this.readyStateChange(FakeXDomainRequest.DONE);
            this.sendFlag = false;
        }
    },

    setResponseBody: function setResponseBody(body) {
        verifyRequestSent(this);
        verifyResponseBodyType(body);

        var chunkSize = this.chunkSize || 10;
        var index = 0;
        this.responseText = "";

        do {
            this.readyStateChange(FakeXDomainRequest.LOADING);
            this.responseText += body.substring(index, index + chunkSize);
            index += chunkSize;
        } while (index < body.length);

        this.readyStateChange(FakeXDomainRequest.DONE);
    },

    respond: function respond(status, contentType, body) {
        // content-type ignored, since XDomainRequest does not carry this
        // we keep the same syntax for respond(...) as for FakeXMLHttpRequest to ease
        // test integration across browsers
        this.status = typeof status === "number" ? status : 200;
        this.setResponseBody(body || "");
    },

    simulatetimeout: function simulatetimeout() {
        this.status = 0;
        this.isTimeout = true;
        // Access to this should actually throw an error
        this.responseText = undefined;
        this.readyStateChange(FakeXDomainRequest.DONE);
    }
});

extend(FakeXDomainRequest, {
    UNSENT: 0,
    OPENED: 1,
    LOADING: 3,
    DONE: 4
});

function useFakeXDomainRequest() {
    FakeXDomainRequest.restore = function restore(keepOnCreate) {
        if (xdr.supportsXDR) {
            global.XDomainRequest = xdr.GlobalXDomainRequest;
        }

        delete FakeXDomainRequest.restore;

        if (keepOnCreate !== true) {
            delete FakeXDomainRequest.onCreate;
        }
    };
    if (xdr.supportsXDR) {
        global.XDomainRequest = FakeXDomainRequest;
    }
    return FakeXDomainRequest;
}

module.exports = {
    xdr: xdr,
    FakeXDomainRequest: FakeXDomainRequest,
    useFakeXDomainRequest: useFakeXDomainRequest
};
