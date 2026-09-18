// Ambient declaration for the ESM internal/native-ref.js.

export function ensureId(preferredId?: string | null): string;

export function invokeNative(id: string, method: string, params?: Record<string, unknown>): Promise<unknown>;

export function createNativeWriter(id: string): {
	write(props: Record<string, unknown>): void;
};

export function createRef(id: string): {
	id: string;
	invoke(method: string, params?: Record<string, unknown>): Promise<unknown>;
	setStyleProperty(name: string, value: unknown): void;
	setStyleProperties(styles: Record<string, unknown>): void;
};
