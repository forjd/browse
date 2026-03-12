export class RingBuffer<T> {
	private items: T[] = [];
	private capacity: number;

	constructor(capacity = 500) {
		this.capacity = capacity;
	}

	push(item: T): void {
		if (this.items.length >= this.capacity) {
			this.items.shift();
		}
		this.items.push(item);
	}

	drain(filter?: (item: T) => boolean): T[] {
		const result = filter ? this.items.filter(filter) : [...this.items];
		this.items = [];
		return result;
	}

	peek(filter?: (item: T) => boolean): T[] {
		return filter ? this.items.filter(filter) : [...this.items];
	}

	clear(): void {
		this.items = [];
	}
}
