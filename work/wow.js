class ListNode {
    constructor(value) {
        this.value = value;
        this.next = null;
    }
}
 let head = null;

 // Insert a new node at the START — O(1), no walking needed.
 function insertNodeAtBegining(value) {
    const newNode = new ListNode(value);   // make the node
    newNode.next = head;                   // link it to the current first node
    head = newNode;                        // move head to the new node
 }

 // Insert a new node at the END — O(n), must walk to the last node first.
 function insertNodeAtEnd(value) {
    const newNode = new ListNode(value);   // make the node (its .next stays null = new end)

    if(head === null) {        // empty list?
        head = newNode;        // the new node becomes the whole list
        return;                // stop — nothing to walk
    }

    let current = head;                 // start at the first node
    while(current.next != null) {       // stop AT the last node (the one whose .next is null) and NOT at last
        current = current.next;
    }
    current.next = newNode;             // attach the new node after the last node
 }

 function printList() {
    let current = head;
    while(current != null) {
        console.log(current.value);
        current = current.next;
    }
 }

 // Delete the FIRST node — O(1), just move head forward.
 function deleteAtBegining() {
    if(head === null) {       // empty list?
        return null;          // nothing to delete
    }
    head = head.next;         // head skips the old first node (it gets garbage-collected)
 }

 // Delete the LAST node — O(n), must walk to the second-to-last node.
 function deleteFromEnd() {
    if(head === null) {           // empty list?
        return null;              // nothing to delete
    }

    // single-element list: the only node IS the last node
    if(head.next === null) {
        head = null;              // remove it -> list becomes empty
        return;
    }

    let current = head;                     // start at the first node
    while(current.next.next != null) {      // stop at the SECOND-to-last node
        current = current.next;             // (look two ahead so we don't step past it)
    }
    current.next = null;                    // unlink the last node (= assignment, not ==)
 }
 // ---- Build the list from the front ----
insertNodeAtBegining(5);   // list: 5
insertNodeAtBegining(4);   // list: 4 -> 5  
insertNodeAtBegining(3);   // list: 3 -> 4 -> 5

// ---- Now add to the back ----
insertNodeAtEnd(9);        // list: 3 -> 4 -> 5 -> 9
insertNodeAtEnd(10);       // list: 3 -> 4 -> 5 -> 9 -> 10

printList();               // prints: 3, 4, 5, 9, 10

