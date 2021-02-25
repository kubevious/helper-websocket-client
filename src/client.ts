import _ from 'the-lodash';
import { v4 as uuidv4 } from 'uuid';
import { io, Socket } from 'socket.io-client';

import { WebSocketScope } from './scope';
import { WebSocketSubscription, WebSocketHandlerCb, WebSocketOptions, WebSocketTarget } from './types';
import { makeKey } from './utils';

export class WebSocketClient
{
    private _socket : Socket | null = null;
    private _customOptions : WebSocketOptions;
    private _subscriptions : Record<string, SubscriptionInfo> = {};
    private _headers : Record<string, any> = {};

    constructor(customOptions? : WebSocketOptions)
    {
        this._customOptions = customOptions || {};
    }

    header(name: string, value: any)
    {
        this._headers[name] = value;
    }

    run()
    {
        console.log("[WebSocket] Running.");

        let socketOptions = _.cloneDeep(this._customOptions);

        socketOptions.transportOptions = {
            polling: {
                extraHeaders: this._headers
            }
        };
        
        const socket = io(socketOptions);

        socket.on('connect', () => {
            console.log("[WebSocket] Connected.");
            this._handleConnect();
        })

        socket.on('update', (data: any) => {
            this._handleUpdate(data);
        })

        socket.on('disconnect', () => {
            console.log("[WebSocket] Disconnected.");
            this._handleDisconnect();
        })

        socket.on("connect_error", (error: Error) => {
            console.warn("[WebSocket] Connect Error: ", error.message);
        });

        this._socket = socket;
    }

    close()
    {
        console.log("[WebSocket] Closing.");

        this._subscriptions = {};
        if (this._socket) {
            this._socket!.close();
            this._socket = null;
        }
    }

    subscribe(target: WebSocketTarget, cb : WebSocketHandlerCb) : WebSocketSubscription
    {
        let id = makeKey(target);

        console.debug('[WebSocket] Subscribe: ' + id);

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
                console.debug('[WebSocket] Unsubscribe: ' + id);
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

    unsubscribeAll()
    {
        console.debug('[WebSocket] UnsubscribeAll');

        this._subscriptions = {};
        if (this._socket) {
            this._socket.emit('unsubscribe_all');
        }
    }

    scope(target: WebSocketTarget, cb : WebSocketHandlerCb)
    {
        let scope = new WebSocketScope(this, target, cb);
        return scope;
    }

    private _notifyTarget(target : WebSocketTarget, isPresent: boolean)
    {
        if (!this._socket) {
            return;
        }
        if (!this._socket.connected) {
            return;
        }

        console.debug("[WebSocket] Notify. Present: " + isPresent + " :: " + JSON.stringify(target));

        if (isPresent) {
            this._socket.emit('subscribe', target)
        } else {
            this._socket.emit('unsubscribe', target)
        }
    }

    private _handleConnect()
    {
        console.log('[WebSocket] CONNECTED')

        for(let subscription of _.values(this._subscriptions))
        {
            this._notifyTarget(subscription.target, true);
        }
    }

    private _handleDisconnect()
    {
        console.log('[WebSocket] DISCONNECTED')
    }

    private _handleUpdate(data : UpdateData)
    {
        console.debug("[WebSocket] TARGET: ",
            JSON.stringify(data.target),
            " => ",
            JSON.stringify(data.value));

        let id = makeKey(data.target);
        console.debug("[WebSocket] _handleUpdate :: TARGET ID: ", id);
        console.debug("[WebSocket] _handleUpdate :: this._subscriptions", _.keys(this._subscriptions));

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