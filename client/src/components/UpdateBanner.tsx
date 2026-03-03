import { useEffect, useState } from 'react';
import { Info, X, Download, RefreshCw } from 'lucide-react';


export default function UpdateBanner() {
    const [updateInfo, setUpdateInfo] = useState<any>(null);
    const [downloaded, setDownloaded] = useState(false);
    const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
    const [visible, setVisible] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        // 7-day dismissal logic
        const lastDismissed = localStorage.getItem('update-banner-dismissed-at');
        const dismissedTime = lastDismissed ? parseInt(lastDismissed, 10) : 0;
        const sevenDays = 7 * 24 * 60 * 60 * 1000;
        const now = Date.now();

        if (now - dismissedTime < sevenDays) {
            console.log('[UpdateBanner] Dismissed within 7 days, staying hidden.');
            return;
        }

        if (window.electronAPI) {
            window.electronAPI.onUpdateAvailable((info) => {
                setUpdateInfo(info);
                setVisible(true);
            });

            window.electronAPI.onUpdateDownloaded((info) => {
                setUpdateInfo(info);
                setDownloaded(true);
                setDownloadProgress(null);
            });

            window.electronAPI.onDownloadProgress((progress) => {
                setDownloadProgress(progress.percent);
            });

            window.electronAPI.onUpdateError((err) => {
                console.error('[UpdateBanner] Update error:', err);
                setError(err);
                // We don't hide the banner on error, just maybe show an error state if it was downloading
            });
        }
    }, []);

    const dismiss = () => {
        setVisible(false);
        localStorage.setItem('update-banner-dismissed-at', Date.now().toString());
    };

    const handleDownload = () => {
        if (window.electronAPI) {
            setError(null);
            window.electronAPI.downloadUpdate();
        }
    };

    const handleInstall = () => {
        if (window.electronAPI) {
            window.electronAPI.quitAndInstallUpdate();
        }
    };

    if (!visible || !updateInfo) return null;

    return (
        <div
            style={{
                backgroundColor: '#1a1d24',
                borderBottom: '1px solid #2d3139',
                padding: '0.6rem 1.5rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '1rem',
                fontSize: '0.85rem',
                color: '#e5e7eb',
                zIndex: 100,
                position: 'relative',
                animation: 'slideDown 0.3s ease-out'
            }}
        >
            <style>{`
        @keyframes slideDown {
          from { transform: translateY(-100%); }
          to { transform: translateY(0); }
        }
      `}</style>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                <div
                    style={{
                        backgroundColor: downloaded ? '#10b981' : '#fbbf24',
                        borderRadius: '50%',
                        width: '24px',
                        height: '24px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0
                    }}
                >
                    {downloaded ? (
                        <RefreshCw size={14} color="#0f1115" />
                    ) : (
                        <Info size={14} color="#0f1115" />
                    )}
                </div>

                <div style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {downloaded ? (
                        <span>New version <strong>v{updateInfo.version}</strong> is ready to install!</span>
                    ) : downloadProgress !== null ? (
                        <span>Downloading update: <strong>{Math.round(downloadProgress)}%</strong></span>
                    ) : error ? (
                        <span style={{ color: '#f87171' }}>Update error: {error}</span>
                    ) : (
                        <span>Program is out of date. Upgrade to <strong>v{updateInfo.version}</strong>?</span>
                    )}
                </div>

                {downloadProgress !== null && (
                    <div style={{ flex: 1, height: '4px', backgroundColor: '#111827', borderRadius: '2px', overflow: 'hidden', maxWidth: '200px' }}>
                        <div
                            style={{
                                height: '100%',
                                width: `${downloadProgress}%`,
                                backgroundColor: '#fbbf24',
                                transition: 'width 0.3s ease-out'
                            }}
                        />
                    </div>
                )}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                {!downloaded && downloadProgress === null && (
                    <button
                        onClick={handleDownload}
                        style={{
                            backgroundColor: '#fbbf24',
                            color: '#0f1115',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.35rem 0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'filter 0.15s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                        onMouseOut={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                    >
                        <Download size={14} />
                        Upgrade Now
                    </button>
                )}

                {downloaded && (
                    <button
                        onClick={handleInstall}
                        style={{
                            backgroundColor: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: '6px',
                            padding: '0.35rem 0.85rem',
                            fontWeight: 600,
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.4rem',
                            transition: 'filter 0.15s'
                        }}
                        onMouseOver={(e) => e.currentTarget.style.filter = 'brightness(1.1)'}
                        onMouseOut={(e) => e.currentTarget.style.filter = 'brightness(1)'}
                    >
                        <RefreshCw size={14} />
                        Restart to Update
                    </button>
                )}

                <button
                    onClick={dismiss}
                    style={{
                        backgroundColor: 'transparent',
                        border: 'none',
                        color: '#9ca3af',
                        cursor: 'pointer',
                        padding: '4px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderRadius: '4px',
                        transition: 'background-color 0.15s'
                    }}
                    onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'}
                    onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}
                    title="Dismiss for 7 days"
                >
                    <X size={18} />
                </button>
            </div>
        </div>
    );
}
