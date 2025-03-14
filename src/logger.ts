interface Logger {
    info: (data: any) => void;
    error: (data: any) => void;
}

export function initLogger(): Logger {
    // Mock implementation
    return {
        info: (data: any) => console.log(JSON.stringify(data)),
        error: (data: any) => console.error(JSON.stringify(data))
    };
}
