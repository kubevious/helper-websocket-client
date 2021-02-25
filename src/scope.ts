import _ from 'the-lodash';
import { WebSocketClient } from './client';
import { WebSocketSubscription, WebSocketHandlerCb, WebSocketTarget } from './types';
import { makeKey } from './utils';

export class WebSocketScope
{
    private _websocket : WebSocketClient;
    private _scopeTarget : WebSocketTarget;
    private _targets : Record<string, TargetInfo> = {};
    private _cb : WebSocketHandlerCb | null = null;

    constructor(websocket : WebSocketClient, scopeTarget: WebSocketTarget, cb : WebSocketHandlerCb)
    {
        this._websocket = websocket;
        this._scopeTarget = scopeTarget;
        this._cb = cb;
    }

    close()
    {
        this._cb = null;
        this.replace([]);
    }

    subscribe(target: WebSocketTarget)
    {
        target = this._makeTarget(target);
        let targetId = makeKey(target);
        if (this._targets[targetId]) {
            return;
        }

        let wsSubscriber = this._websocket.subscribe(target, this._handle.bind(this))

        this._targets[targetId] = {
            target: target,
            subscriber: wsSubscriber
        };
    }

    unsubscribe(target: WebSocketTarget)
    {
        target = this._makeTarget(target);
        let targetId = makeKey(target);
        let info = this._targets[targetId];

        if (!info) {
            return;
        }

        info.subscriber.close();
        delete this._targets[targetId];
    }

    replace(newTargets: WebSocketTarget[])
    {
        newTargets = newTargets.map(x => this._makeTarget(x));
        let newTargetsDict = _.makeDict(newTargets, x => makeKey(x), x => x);
        let diffs = [

        ];

        for(let id of _.keys(this._targets))
        {
            if (!newTargetsDict[id])
            {
                diffs.push({
                    target: this._targets[id].target,
                    present: false
                })
            }
        }

        for(let id of _.keys(newTargetsDict))
        {
            if (!this._targets[id])
            {
                diffs.push({
                    target: newTargetsDict[id],
                    present: true
                })
            }
        }

        for(let delta of diffs)
        {
            if (delta.present) {
                this.subscribe(delta.target);
            } else {
                this.unsubscribe(delta.target);
            }
        }
    }

    private _handle(value: any, target: WebSocketTarget)
    {
        if (this._cb) {
            this._cb(value, target);
        }
    }

    private _makeTarget(target: WebSocketTarget) : WebSocketTarget
    {
        if (this._scopeTarget) {
            target = _.cloneDeep(target);
            target = _.defaults(target, this._scopeTarget);
        }
        return target;
    }

}

interface TargetInfo
{
    target: WebSocketTarget,
    subscriber: WebSocketSubscription
}