import _ from 'the-lodash';
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';

import { WebSocketScope } from './scope';
import { WebSocketSubscription, WebSocketHandlerCb, WebSocketOptions, WebSocketTarget } from './types';
import { makeKey } from './utils';

export type HeaderValue = string | number;
export type HeaderValueX = HeaderValue | (() => HeaderValue);

export class WebSocketClient
{
    private _socket : Socket | null = null;
    private _customOptions : WebSocketOptions;
    private _subscriptions : Record<string, SubscriptionInfo> = {};
    private _context : Record<string, any> = {};
    private _headers : Record<string, HeaderValueX> = {};
    private _isRunning : boolean = false;

    constructor(customOptions? : WebSocketOptions)
    {
        this._customOptions = customOptions || {};
    }

    header(name: string, value: HeaderValueX)
    {
        this._headers[name] = value;
    }

    run()
    {
        console.log("[WebSocketClient] Running.");
        this._isRunning = true;
        this._connect();
    }

    private _connect()
    {
        if (!this._isRunning) {
            return;
        }
        if (this._socket) {
            return;
        }

        let socketOptions = _.cloneDeep(this._customOptions);

        let headers : Record<string, string> = {};
        for(let name of _.keys(this._headers))
        {
            const value = this._headers[name];
            if (_.isFunction(value)) {
                let finalValue = value();
                headers[name] = _.toString(finalValue);
            }
            else
            {
                headers[name] = _.toString(value);
            }
        }

        socketOptions.transportOptions = {
            polling: {
                extraHeaders: headers
            }
        };

        socketOptions.reconnection = false;
        
        const socket = io(socketOptions);

        socket.on('connect', () => {
            console.log("[WebSocketClient] Connected.");
            this._handleConnect();
        })

        socket.on('update', (data: any) => {
            this._handleUpdate(data);
        })

        socket.on('disconnect', () => {
            this._handleDisconnect();
        })

        socket.on("connect_error", (error: Error) => {
            console.warn("[WebSocketClient] Connect Error: ", error.message);
        });

        this._socket = socket;
    }

    close()
    {
        console.log("[WebSocketClient] Closing.");

        this._isRunning = false;

        this._subscriptions = {};
        if (this._socket) {
            this._socket!.close();
            this._socket = null;
        }
    }

    subscribe(target: WebSocketTarget, cb : WebSocketHandlerCb) : WebSocketSubscription
    {
        let id = makeKey(target);
        console.debug("[WebSocketClient]Subscribe: " + id);

        if (!this._subscriptions[id]) {
            this._subscriptions[id] = {
                target: target,
                listeners: {}
            }
        }

        if (_.keys(this._subscriptions[id].listeners).length == 0) {
            this._notifyTarget(target, true);
        }

        let listenerId = uuidv4();
        this._subscriptions[id].listeners[listenerId] = cb;

        return {
            close: () => {
                console.debug("[WebSocketClient] Unsubscribe: " + id);
                const subscriptionInfo = this._subscriptions[id];
                if (subscriptionInfo)
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
        let scope = new WebSocketScope(this, target, cb);
        return scope;
    }

    updateContext(updatedContext: WebSocketTarget)
    {
        for(let key of _.keys(updatedContext))
        {
            let value = updatedContext[key];
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

    private _notifyContext()
    {
        if (!this._socket) {
            return;
        }
        if (!this._socket.connected) {
            return;
        }

        console.debug("[WebSocketClient] Notify Context: ", this._context);

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

        console.debug("[WebSocketClient] Notify. Present: ", isPresent, target);

        if (isPresent) {
            this._socket.emit(UserMessages.subscribe, target)
        } else {
            this._socket.emit(UserMessages.unsubscribe, target)
        }
    }

    private _handleConnect()
    {
        console.log("[WebSocketClient] Connected.")

        this._notifyContext();
        
        for(let subscription of _.values(this._subscriptions))
        {
            this._notifyTarget(subscription.target, true);
        }
    }

    private _handleDisconnect()
    {
        console.log("[WebSocketClient] Disconnected.");

        if (!this._isRunning) {
            return;
        }

        this._socket = null;
        setTimeout(() => {
            this._connect();
        }, 1000)
    }

    private _handleUpdate(data : UpdateData)
    {
        console.debug("[WebSocketClient] Target: ",
            JSON.stringify(data.target),
            " => ",
            JSON.stringify(data.value));

        let id = makeKey(data.target);

        const subscriptionInfo = this._subscriptions[id];
        if (subscriptionInfo)
        {
            for(let listener of _.values(subscriptionInfo.listeners))
            {
                listener(data.value, data.target);
            }
        }
    }
}


interface SubscriptionInfo 
{
    target: WebSocketTarget,
    listeners: Record<string, WebSocketHandlerCb>
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