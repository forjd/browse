export class RingBuffer<T> {
	private items: (T | undefined)[];
	private head = 0;
	private size = 0;
	private capacity: number;

	constructor(capacity = 500) {
		this.capacity = capacity;
		this.items = new Array(capacity);
	}

	push(item: T): void {
		const index = (this.head + this.size) % this.capacity;
		if (this.size === this.capacity) {
			this.head = (this.head + 1) % this.capacity;
		} else {
			this.size++;
		}
		this.items[index] = item;
	}

	drain(filter?: (item: T) => boolean): T[] {
		const result: T[] = [];
		for (let i = 0; i < this.size; i++) {
			const item = this.items[(this.head + i) % this.capacity] as T;
			if (!filter || filter(item)) result.push(item);
		}
		this.head = 0;
		this.size = 0;
		this.items = new Array(this.capacity);
		return result;
	}

	peek(filter?: (item: T) => boolean): T[] {
		const result: T[] = [];
		for (let i = 0; i < this.size; i++) {
			const item = this.items[(this.head + i) % this.capacity] as T;
			if (!filter || filter(item)) result.push(item);
		}
		return result;
	}

	clear(): void {
		this.head = 0;
		this.size = 0;
		this.items = new Array(this.capacity);
	}
}
