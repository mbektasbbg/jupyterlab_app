// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import {
    JSONValue, JSONObject
} from '@phosphor/coreutils';

import {
    IApplication, IStatefulService
} from 'jupyterlab_app/src/main/app';

import {
    IExposedMethod, IExposedMethodPrivate, IMainConnect
} from 'jupyterlab_app/src/ipc2/main';

import {
    IDataConnector, ISettingRegistry
} from '@jupyterlab/coreutils';

import {
    IService
} from 'jupyterlab_app/src/main/main';

import * as path from 'path';
import * as fs from 'fs';

export
let fetch: IExposedMethod<string, ISettingRegistry.IPlugin> = {
    id: 'JupyterLabDataConnector-fetch'
}

export
let save: IExposedMethod<ISaveOptions, void> = {
    id: 'JupyterLabDataConnector-save'
}

export
interface ISaveOptions {
    id: string;
    user: JSONObject;
}

/**
 * Create a data connector to be used by the render
 * processes. Stores JupyterLab plugin settings that
 * need to be persistent.
 * 
 * If settings are not found in the apllication data
 * directory, default settings are read in from the 
 * application bundle.
 */
export
class JupyterLabDataConnector
implements IStatefulService, IDataConnector<ISettingRegistry.IPlugin, JSONObject> {

    id: string = 'JupyterLabSettings';

    constructor(app: IApplication, remote: IMainConnect) {
        this._settings = app.registerStatefulService(this)
            .then((settings: Private.IPluginData) => {
                if(!settings) {
                    return this._getDefaultSettings();
                }
                return settings;
            })
            .catch(() => {
                return this._getDefaultSettings();
            });
        
        // Create 'fetch' exposed method
        remote.registerExposedMethod(this._exposedFetch);
        
        // Create 'save' exposed method
        remote.registerExposedMethod(this._exposedSave);
    }

    /**
     * Fetch settings for a plugin.
     * 
     * @param id The plugin id.
     */
    fetch(id: string): Promise<ISettingRegistry.IPlugin> {
        return this._settings
            .then((data: any) => {
                if (!data[id]) {
                    return Promise.reject(new Error('Setting ' + id + ' not available'));
                }

                return Promise.resolve({
                    id: id,
                    schema: data[id].schema,
                    data: data[id].data
                });
            })
    }

    /**
     * Remove a setting. Not needed in this implementation.
     * 
     * @param id The plugin id.
     */
    remove(id: string): Promise<void> {
        return Promise.reject(new Error('Removing setting resources is note supported.'));
    }

    /**
     * Save user settings for a plugin.
     * 
     * @param id 
     * @param user 
     */
    save(id: string, user: JSONObject): Promise<void> {
        let saving = this._settings
            .then((data: Private.IPluginData) => {
                if (!user[id]) {
                    return Promise.reject(new Error('Schema not found for: ' + id ));
                }
                data[id].data = user as ISettingRegistry.ISettingBundle;
                return Promise.resolve(data);
            });

        this._settings = saving;
        return saving.then(() => {});
    }

    getStateBeforeQuit(): Promise<JSONValue> {
        return this._settings;
    }

    verifyState(state: Private.IPluginData): boolean {
        for (let key in state) {
            if (state[key].schema === undefined || state[key].data === undefined) {
                return false;
            }
        }
        return true;
    }

    /**
     * Get default JupyterLab settings from application
     * bundle.
     */
    private _getDefaultSettings(): Promise<Private.IPluginData> {
        let schemasPath = path.join(__dirname, 'schemas');

        return new Promise<string[]>((res, rej) => {
            // Get files in schema directory
            fs.readdir(schemasPath, (err, files) => {
                if (err) {
                    rej(err);
                    return;
                }
                res(files);
            });
        }).then((files: string[]) => {
            // Parse data in schema files
            return Promise.all(files.map(file => {
                let sectionName = path.basename(file);
                sectionName = sectionName.slice(0, sectionName.length - '.json'.length);
                return new Promise<ISettingRegistry.IPlugin>((res, rej) => {
                    fs.readFile(path.join(schemasPath, file), (err, data: Buffer) => {
                        if (err) {
                            res(null);
                            return;
                        }
                        
                        res({
                            id: sectionName,
                            schema: JSON.parse(data.toString()),
                            data: {} as ISettingRegistry.ISettingBundle
                        });
                    });
                });
            }));
        }).then((settings: ISettingRegistry.IPlugin[]) => {
            let iSettings: any = {};
            settings.forEach(setting => {
                if (!setting)
                    return;
                iSettings[setting.id] = {schema: setting.schema, data: setting.data};
            });
            return iSettings;
        }).catch((e) => {
            console.error(e);
            return Promise.resolve({});
        })
    }

    private _exposedFetch: IExposedMethodPrivate<string, ISettingRegistry.IPlugin> = {
        ...fetch,
        execute: this.fetch.bind(this)
    }
    
    private _exposedSave: IExposedMethodPrivate<ISaveOptions, void> = {
        ...save,
        execute: (opts: ISaveOptions) => {
            return this.save(opts.id, opts.user);
        },
    }

    private _settings: Promise<Private.IPluginData>;
}

namespace Private {

    export
    interface IPluginData {
        [key: string]: {data: ISettingRegistry.ISettingBundle, schema: ISettingRegistry.ISchema};
    }
}

let service: IService = {
    requirements: ['IApplication', 'IMainConnect'],
    provides: 'IDataConnectory',
    activate: (app: IApplication, remote: IMainConnect): IDataConnector<ISettingRegistry.IPlugin, JSONObject> => {
        return new JupyterLabDataConnector(app, remote);
    },
    autostart: true
}
export default service;

