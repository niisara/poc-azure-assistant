export interface Config {
    vault: any;
}

export async function getConfig(): Promise<Config> {
    // Mock implementation
    return {
        vault: {}
    };
}
