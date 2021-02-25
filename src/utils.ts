import _ from 'the-lodash';
import {  WebSocketTarget } from './types';

export function makeKey(target: WebSocketTarget) : string
{
    return _.stableStringify(target);
}
