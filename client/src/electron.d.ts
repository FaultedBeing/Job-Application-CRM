export { };

declare global {
    interface Window {
        electronAPI: {
            getAppVersion: () => Promise<string>;
            checkForUpdates: () => void;
            dialogResponse: (dialogId: string, buttonIndex: number) => void;
            openExternal: (url: string) => Promise<void>;
            gmailOAuthConnect: (payload: any) => Promise<any>;
            gmailOAuthStatus: () => Promise<any>;
            gmailOAuthDisconnect: () => Promise<any>;
            gmailSendTest: (payload: any) => Promise<any>;
            onUpdateAvailable: (callback: (info: any) => void) => void;
            onUpdateDownloaded: (callback: (info: any) => void) => void;
            onDownloadProgress: (callback: (progress: any) => void) => void;
            onUpdateError: (callback: (err: string) => void) => void;
            downloadUpdate: () => void;
            quitAndInstallUpdate: () => void;
            setAutoLaunch: (enabled: boolean) => void;
        };
    }
}
