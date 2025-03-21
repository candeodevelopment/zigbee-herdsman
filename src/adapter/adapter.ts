import events from 'node:events';

import * as Models from '../models';
import {BroadcastAddress} from '../zspec/enums';
import * as Zcl from '../zspec/zcl';
import * as Zdo from '../zspec/zdo';
import * as ZdoTypes from '../zspec/zdo/definition/tstypes';
import {discoverAdapter} from './adapterDiscovery';
import * as AdapterEvents from './events';
import * as TsType from './tstype';

interface AdapterEventMap {
    deviceJoined: [payload: AdapterEvents.DeviceJoinedPayload];
    zclPayload: [payload: AdapterEvents.ZclPayload];
    zdoResponse: [clusterId: Zdo.ClusterId, response: ZdoTypes.GenericZdoResponse];
    disconnected: [];
    deviceLeave: [payload: AdapterEvents.DeviceLeavePayload];
}

type AdapterConstructor = new (
    networkOptions: TsType.NetworkOptions,
    serialPortOptions: TsType.SerialPortOptions,
    backupPath: string,
    adapterOptions: TsType.AdapterOptions,
) => Adapter;

export abstract class Adapter extends events.EventEmitter<AdapterEventMap> {
    public hasZdoMessageOverhead: boolean;
    public manufacturerID: Zcl.ManufacturerCode;
    protected networkOptions: TsType.NetworkOptions;
    protected adapterOptions: TsType.AdapterOptions;
    protected serialPortOptions: TsType.SerialPortOptions;
    protected backupPath: string;

    protected constructor(
        networkOptions: TsType.NetworkOptions,
        serialPortOptions: TsType.SerialPortOptions,
        backupPath: string,
        adapterOptions: TsType.AdapterOptions,
    ) {
        super();
        this.hasZdoMessageOverhead = true;
        this.manufacturerID = Zcl.ManufacturerCode.RESERVED_10;
        this.networkOptions = networkOptions;
        this.adapterOptions = adapterOptions;
        this.serialPortOptions = serialPortOptions;
        this.backupPath = backupPath;
    }

    /**
     * Utility
     */

    public static async create(
        networkOptions: TsType.NetworkOptions,
        serialPortOptions: TsType.SerialPortOptions,
        backupPath: string,
        adapterOptions: TsType.AdapterOptions,
    ): Promise<Adapter> {
        const adapterLookup = {
            deconz: ['./deconz/adapter/deconzAdapter', 'DeconzAdapter'],
            ember: ['./ember/adapter/emberAdapter', 'EmberAdapter'],
            ezsp: ['./ezsp/adapter/ezspAdapter', 'EZSPAdapter'],
            zstack: ['./z-stack/adapter/zStackAdapter', 'ZStackAdapter'],
            zboss: ['./zboss/adapter/zbossAdapter', 'ZBOSSAdapter'],
            zigate: ['./zigate/adapter/zigateAdapter', 'ZiGateAdapter'],
        };
        const [adapter, path] = await discoverAdapter(serialPortOptions.adapter, serialPortOptions.path);
        const detectedAdapter = adapterLookup[adapter];

        if (detectedAdapter) {
            serialPortOptions.adapter = adapter;
            serialPortOptions.path = path;

            const adapterModule = await import(`${detectedAdapter[0]}.js`);
            const AdapterCtor = adapterModule[detectedAdapter[1]] as AdapterConstructor;

            return new AdapterCtor(networkOptions, serialPortOptions, backupPath, adapterOptions);
        } else {
            throw new Error(`Adapter '${adapter}' does not exists, possible options: ${Object.keys(adapterLookup).join(', ')}`);
        }
    }

    public abstract start(): Promise<TsType.StartResult>;

    public abstract stop(): Promise<void>;

    public abstract getCoordinatorIEEE(): Promise<string>;

    public abstract getCoordinatorVersion(): Promise<TsType.CoordinatorVersion>;

    public abstract reset(type: 'soft' | 'hard'): Promise<void>;

    public abstract supportsBackup(): Promise<boolean>;

    public abstract backup(ieeeAddressesInDatabase: string[]): Promise<Models.Backup>;

    public abstract getNetworkParameters(): Promise<TsType.NetworkParameters>;

    public abstract addInstallCode(ieeeAddress: string, key: Buffer, hashed: boolean): Promise<void>;

    public abstract waitFor(
        networkAddress: number | undefined,
        endpoint: number,
        frameType: Zcl.FrameType,
        direction: Zcl.Direction,
        transactionSequenceNumber: number | undefined,
        clusterID: number,
        commandIdentifier: number,
        timeout: number,
    ): {promise: Promise<AdapterEvents.ZclPayload>; cancel: () => void};

    /**
     * ZDO
     */

    public abstract sendZdo(
        ieeeAddress: string,
        networkAddress: number,
        clusterId: Zdo.ClusterId,
        payload: Buffer,
        disableResponse: true,
    ): Promise<void>;
    public abstract sendZdo<K extends keyof ZdoTypes.RequestToResponseMap>(
        ieeeAddress: string,
        networkAddress: number,
        clusterId: K,
        payload: Buffer,
        disableResponse: false,
    ): Promise<ZdoTypes.RequestToResponseMap[K]>;
    public abstract sendZdo<K extends keyof ZdoTypes.RequestToResponseMap>(
        ieeeAddress: string,
        networkAddress: number,
        clusterId: K,
        payload: Buffer,
        disableResponse: boolean,
    ): Promise<ZdoTypes.RequestToResponseMap[K] | void>;

    public abstract permitJoin(seconds: number, networkAddress?: number): Promise<void>;

    /**
     * ZCL
     */

    public abstract sendZclFrameToEndpoint(
        ieeeAddr: string,
        networkAddress: number,
        endpoint: number,
        zclFrame: Zcl.Frame,
        timeout: number,
        disableResponse: boolean,
        disableRecovery: boolean,
        sourceEndpoint?: number,
    ): Promise<AdapterEvents.ZclPayload | void>;

    public abstract sendZclFrameToGroup(groupID: number, zclFrame: Zcl.Frame, sourceEndpoint?: number): Promise<void>;

    public abstract sendZclFrameToAll(endpoint: number, zclFrame: Zcl.Frame, sourceEndpoint: number, destination: BroadcastAddress): Promise<void>;

    /**
     * InterPAN
     */

    public abstract setChannelInterPAN(channel: number): Promise<void>;

    public abstract sendZclFrameInterPANToIeeeAddr(zclFrame: Zcl.Frame, ieeeAddress: string): Promise<void>;

    public abstract sendZclFrameInterPANBroadcast(zclFrame: Zcl.Frame, timeout: number): Promise<AdapterEvents.ZclPayload>;

    public abstract restoreChannelInterPAN(): Promise<void>;
}

export default Adapter;
