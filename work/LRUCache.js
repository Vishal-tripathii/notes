class LRUCache {
    constructor(capacity) {
        this.capacity = capacity;
        this.cache = new Map();
    }

    get(key) { // when getting, so means this is the MRU value, so needs to go to the end of the map because map remembers order
        //so last added means fresh therefore MRU
        if(!this.cache.has(key)) {
            return -1
        }
        const value = this.cache.get(key);
        this.cache.delete(key);
        this.cache.set(key, value); // added again for fresh

        return value;
    }

    put(key, value) { // also when updating, we are doing it fresh
        if(this.cache.has(key)) { // if exists then proceed to delete
            this.cache.delete(key);
        }
        this.cache.set(key, value); // after deleting add as fresh so becomes MRU

        // also we need to check if the capacity is not overloaded
        if(this.cache.size > this.capacity) { // if yes need to remove LRU i.e first
            const lruKey = this.cache.keys().next().value;
            this.cache.delete(lruKey);
        }
    }
}

const lru = new LRUCache(2);
lru.put(1, "a");
lru.put(2, "b");
