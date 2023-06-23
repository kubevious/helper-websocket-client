import _ from 'the-lodash';
import { BlockingResolver, MyPromise, Resolvable } from 'the-promise'
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';

import { WebSocketScope } from './scope';
import { WebSocketSubscription, WebSocketHandlerCb, WebSocketOptions, WebSocketTarget } from './types';
import { makeKey } from './utils';

export type HeaderValue = string | number;
export type HeaderValueX = HeaderValue | (() => HeaderValue) | Resolvable<HeaderValue>;
export type AuthorizationTokenCb = () => string;

export class WebSocketClient
{
    private _socketName: string;
    private _socket : Socket | null = null;
    private _customOptions : WebSocketOptions;
    private _subscriptions : Record<string, SubscriptionInfo> = {};
    private _context : Record<string, any> = {};
    private _headers : Record<string, HeaderValueX> = {};
    private _isRunning : boolean = false;
    private _isConnecting : boolean = false;
    private _finalHeaders: Record<string, string> = {};

    private _authorizerResolver : BlockingResolver<string> | null = null; 

    constructor(socketName: string, customOptions? : WebSocketOptions)
    {
        this._socketName = socketName;
        this._customOptions = customOptions || {};
    }

    get finalHeaders() {
        return this._finalHeaders;
    }

    authorization(cb: AuthorizationTokenCb)
    {
        this._authorizerResolver = new BlockingResolver(cb);
    }

    authorizationP(resolver: BlockingResolver<string>)
    {
        this._authorizerResolver = resolver;
    }

    header(name: string, value: HeaderValueX)
    {
        this._headers[name] = value;
    }

    run()
    {
        console.log("[WebSocketClient] {", this._socketName, "} Running.");
        this._isRunning = true;
        this._connect();
    }
    
    forceReconnect()
    {
        console.log("[WebSocketClient] {", this._socketName, "} ForceReconnect.");

        if (this._socket) {
            this._socket.disconnect();
        }
    }

    close()
    {
        console.log("[WebSocketClient] {", this._socketName, "} Close.");

        this._isRunning = false;

        this._subscriptions = {};
        if (this._socket) {
            this._socket!.close();
            this._socket = null;
        }
    }

    subscribe(target: WebSocketTarget, cb : WebSocketHandlerCb) : WebSocketSubscription
    {
        const id = makeKey(target);
        console.log("[WebSocketClient] {", this._socketName, "} Subscribe: " + id);

        if (!this._subscriptions[id]) {
            this._subscriptions[id] = {
                target: target,
                listeners: {}
            }
        }

        const subscriptionInfo = this._subscriptions[id]!;

        const isFirstListener = (_.keys(subscriptionInfo.listeners).length == 0);

        const listenerId = uuidv4();
        subscriptionInfo.listeners[listenerId] = cb;

        if (isFirstListener) {
            this._notifyTarget(target, true);
        } else {
            if (!_.isUndefined(subscriptionInfo.lastValue)) {
                cb(subscriptionInfo.lastValue, target);
            }
        }


        return {
            close: () => {
                console.log("[WebSocketClient] {", this._socketName, "} Unsubscribe: " + id);
                if (subscriptionInfo.listeners[listenerId])
                {
                    delete subscriptionInfo.listeners[listenerId];
                    if (_.keys(subscriptionInfo.listeners).length == 0) {
                        this._notifyTarget(target, false);
                        delete this._subscriptions[id];
                    }
                }
            }
        }
    }

    scope(target: WebSocketTarget, cb : WebSocketHandlerCb)
    {
        const scope = new WebSocketScope(this, target, cb);
        return scope;
    }

    updateContext(updatedContext: WebSocketTarget)
    {
        for(const key of _.keys(updatedContext))
        {
            const value = updatedContext[key];
            if (_.isNullOrUndefined(value))
            {
                delete this._context[key];
            }
            else
            {
                this._context[key] = value;
            }
        }
        this._notifyContext();
    }

    private _connect()
    {
        if (!this._isRunning) {
            return;
        }
        if (this._socket) {
            return;
        }
        if (this._isConnecting) {
            return;
        }
        this._isConnecting = true;

        const socketOptions = _.cloneDeep(this._customOptions);

        if (!socketOptions.query) {
            socketOptions.query = {};
        }

        // TODO: think about this:
        // if (!socketOptions.transports) {
        //     socketOptions.transports = ['websocket'];
        // }

        const headers : Record<string, string> = {};

        console.log("[WebSocketClient] {", this._socketName, "} Connecting...");

        Promise.resolve(null)
            .then(() => {
                if (!this._authorizerResolver) {
                    return;
                }

                return this._authorizerResolver.resolve()
                    .then(token => {
                        if (token) {
                            socketOptions.query!["Authorization"] = token;
                        } else {
                            // Should we throw an error?   
                            console.error("[WebSocketClient] Could not fetch a token.");
                        }
                    });
            })
            .then(() => {
                return MyPromise.serial(_.keys(this._headers), name => {
                    const rawValue = this._headers[name];
                    return Promise.resolve(rawValue)
                        .then(value => {
                            if (_.isFunction(value)) {
                                const finalValue = value();
                                headers[name] = _.toString(finalValue);
                            } else {
                                headers[name] = _.toString(value);
                            }
                        })
                })
            })
            .then(() => {
                socketOptions.transportOptions = {
                    polling: {
                        extraHeaders: headers
                    }
                };

                this._finalHeaders = headers;

                console.log("[WebSocketClient] {", this._socketName, "} socketOptions: ", socketOptions);

                socketOptions.reconnection = false;

                const socket = io(socketOptions);

                socket.on('connect', () => {
                    console.log("[WebSocketClient] {", this._socketName, "} Connected.");
                    this._handleConnect();
                })
        
                socket.on('update', (data: any) => {
                    this._handleUpdate(data);
                })
        
                socket.on('disconnect', () => {
                    this._handleDisconnect(socket);
                })
        
                socket.on("connect_error", (error: Error) => {
                    console.warn("[WebSocketClient] {", this._socketName, "} Connect Error: ", error.message);
                    this._handleDisconnect(socket);
                });
        
                this._socket = socket;
                return null;
            })
            .catch(reason => {
                console.error("[WebSocketClient] Rejected: ", reason);
                this._handleDisconnect(null);
                return null;
            })
    }

    private _notifyContext()
    {
        if (!this._socket) {
            return;
        }
        if (!this._socket.connected) {
            return;
        }

        console.log("[WebSocketClient] {", this._socketName, "} Notify Context: ", this._context);

        this._socket.emit(UserMessages.update_context, this._context)
    }
    
    private _notifyTarget(target : WebSocketTarget, isPresent: boolean)
    {
        if (!this._socket) {
            return;
        }
        if (!this._socket.connected) {
            return;
        }

        console.log("[WebSocketClient] {", this._socketName, "} Notify. Present: ", isPresent, target);

        if (isPresent) {
            this._socket.emit(UserMessages.subscribe, target)
        } else {
            this._socket.emit(UserMessages.unsubscribe, target)
        }
    }

    private _handleConnect()
    {
        console.log("[WebSocketClient] {", this._socketName, "} Connected.")

        this._notifyContext();
        
        for(const subscription of _.values(this._subscriptions))
        {
            this._notifyTarget(subscription.target, true);
        }
    }

    private _handleDisconnect(oldSocket: Socket | null)
    {
        console.log("[WebSocketClient] {", this._socketName, "} Disconnected.");

        if (!this._isRunning) {
            return;
        }

        if (oldSocket) {
            if (!this._socket) {
                return;
            }
            
            if (oldSocket! !== this._socket!) {
                return;
            }
        }

        this._isConnecting = false;

        this._socket = null;
        setTimeout(() => {
            this._connect();
        }, 1000)
    }

    private _handleUpdate(data : UpdateData)
    {
        console.log("[WebSocketClient] {", this._socketName, "} TargetUpdate: ",
            JSON.stringify(data.target),
            " => ",
            JSON.stringify(data.value));

        const id = makeKey(data.target);

        const subscriptionInfo = this._subscriptions[id];
        if (subscriptionInfo)
        {
            const value = data.value;
            subscriptionInfo.lastValue = value;
            for(const listener of _.values(subscriptionInfo.listeners))
            {
                listener(value, data.target);
            }
        }
    }
}


interface SubscriptionInfo 
{
    target: WebSocketTarget,
    listeners: Record<string, WebSocketHandlerCb>,
    lastValue?: any
}

interface UpdateData
{
    value: any,
    target: WebSocketTarget
}

export enum UserMessages
{
    subscribe = 'subscribe',
    unsubscribe = 'unsubscribe',
    update_context = 'update_context'
}