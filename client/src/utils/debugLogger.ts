type LogListener = (message: string) => void;

class DebugLogger {
    private listeners: Set<LogListener> = new Set();
    private logs: Array<{ id: number; message: string; timestamp: Date }> = [];
    private nextId = 1;

    public log(message: string) {
        if (localStorage.getItem('debug_mode') !== 'true') return;

        const entry = { id: this.nextId++, message, timestamp: new Date() };
        this.logs.push(entry);

        // Keep only last 100 logs to prevent memory leaks
        if (this.logs.length > 100) {
            this.logs.shift();
        }

        this.notifyListeners();
    }

    public getLogs() {
        return this.logs;
    }

    public clear() {
        this.logs = [];
        this.notifyListeners();
    }

    public subscribe(listener: LogListener) {
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    private notifyListeners() {
        // We pass the latest message for convenience, but listeners usually just fetch all logs
        const latestMessage = this.logs.length > 0 ? this.logs[this.logs.length - 1].message : '';
        this.listeners.forEach(listener => listener(latestMessage));
    }
}

export const debugLogger = new DebugLogger();

export function debugLog(message: string) {
    debugLogger.log(message);
}
