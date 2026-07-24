class LinkNode {
    constructor(value) {
        this.value = value;
        this.next = null;
    }
}

let head = null;

function insertAtEnd(value) {
    const newNode = new LinkNode(value);
    head = newNode;
}

function insertAtEnd(value) {
    if(head === null) {
        return;
    }
    let current = head;
    if(current.next != null) {
        current = current.next;
    }
}
