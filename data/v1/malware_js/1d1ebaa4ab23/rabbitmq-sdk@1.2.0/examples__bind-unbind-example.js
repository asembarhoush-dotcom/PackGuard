const { SdkRabbitmq } = require('../dist/index');

async function bindUnbindExample() {
  try {
    // Get SDK instance
    const sdk = await SdkRabbitmq.getInstance();
    
    console.log('SDK initialized successfully');

    // Example 1: Basic binding
    console.log('\n=== Basic Binding ===');
    await sdk.bind('notifications', 'events', 'user.created');
    console.log('✓ Bound notifications queue to events exchange with user.created routing key');

    // Example 2: Multiple bindings for the same queue
    console.log('\n=== Multiple Bindings ===');
    await sdk.bind('analytics', 'user-events', 'user.login');
    await sdk.bind('analytics', 'user-events', 'user.logout');
    await sdk.bind('analytics', 'order-events', 'order.*');
    console.log('✓ Bound analytics queue to multiple exchanges and routing keys');

    // Example 3: Topic exchange patterns
    console.log('\n=== Topic Exchange Patterns ===');
    await sdk.bind('logs', 'system-logs', 'error.#');      // All error logs
    await sdk.bind('alerts', 'system-logs', '*.critical'); // Critical from any service
    console.log('✓ Bound queues with topic exchange patterns');

    // Example 4: Unbinding when no longer needed
    console.log('\n=== Unbinding ===');
    await sdk.unbind('analytics', 'user-events', 'user.login');
    console.log('✓ Unbound analytics queue from user.login routing key');

    await sdk.unbind('notifications', 'events', 'user.created');
    console.log('✓ Unbound notifications queue from user.created routing key');

    // Example 5: Error handling
    console.log('\n=== Error Handling ===');
    try {
      await sdk.bind('', 'exchange', 'route'); // Invalid queue name
    } catch (error) {
      console.log('✓ Caught validation error:', error.message);
    }

    console.log('\n=== Example completed successfully ===');
    
    // Graceful shutdown
    await sdk.disconnect();
    console.log('SDK disconnected');

  } catch (error) {
    console.error('Example failed:', error);
  }
}

// Run the example
bindUnbindExample();