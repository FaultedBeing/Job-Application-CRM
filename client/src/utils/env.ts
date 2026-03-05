export const isElectron = () => {
    return typeof window !== 'undefined' && !!window.electronAPI;
};

export const isMobileLayout = () => {
    return typeof window !== 'undefined' && window.innerWidth < 768;
};
