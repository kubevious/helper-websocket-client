import { ManagerOptions, SocketOptions } from "socket.io-client";

export type WebSocketOptions = Partial<ManagerOptions & SocketOptions>;
export type WebSocketTarget = Record<string, any>;
export type WebSocketHandlerCb = (value: any, target: WebSocketTarget) => any;

export interface WebSocketSubscription {
    close() : void
}