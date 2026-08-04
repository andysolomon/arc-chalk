export interface LocalRepository<T> {
  get(id: string): Promise<T | undefined>;
  put(value: T): Promise<void>;
}
