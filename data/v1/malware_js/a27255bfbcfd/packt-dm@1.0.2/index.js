console.log("packt loaded");
console.log("packt __dirname:", __dirname);
console.log("packt process.cwd():", process.cwd());

module.exports = function packt() {
    console.log("packt() executed");
    console.log("runtime cwd:", process.cwd());
};