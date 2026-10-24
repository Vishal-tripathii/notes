setTimeout(() => {
    console.log("B");
}, 2000);

const start = Date.now();

while (Date.now() - start < 5000) {
    // block JavaScript for 5 seconds
}