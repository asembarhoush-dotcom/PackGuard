const amqp = require('amqplib');

async function testRawRabbitMQ() {
  console.log('🧪 Teste direto com amqplib...\n');
  
  let connection;
  let channel;
  
  try {
    // Conectar
    console.log('🔌 Conectando...');
    connection = await amqp.connect('amqp://localhost:5677');
    channel = await connection.createChannel();
    console.log('✅ Conectado\n');
    
    // Criar exchange e queue
    console.log('📡 Criando exchange e queue...');
    await channel.assertExchange('test.exchange', 'topic', { durable: true });
    const queueResult = await channel.assertQueue('test.queue', { durable: true });
    await channel.bindQueue('test.queue', 'test.exchange', 'phone.*');
    console.log('✅ Exchange e queue criados\n');
    
    // Configurar consumer
    console.log('👂 Configurando consumer...');
    await channel.consume('test.queue', (message) => {
      if (message) {
        console.log('\n🎉 MENSAGEM RECEBIDA!');
        console.log('📄 Content:', message.content.toString());
        console.log('🏷️ Routing Key:', message.fields.routingKey);
        console.log('📡 Exchange:', message.fields.exchange);
        channel.ack(message);
      }
    });
    console.log('✅ Consumer configurado\n');
    
    // Aguardar um pouco
    console.log('⏳ Aguardando 2 segundos...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Enviar mensagem
    console.log('📤 Enviando mensagem...');
    const payload = JSON.stringify({
      phone: '5511999999999',
      message: 'Teste direto'
    });
    
    const published = channel.publish('test.exchange', 'phone.5511999999999', Buffer.from(payload));
    console.log('📊 Publicado:', published);
    
    // Aguardar processamento
    console.log('\n⏳ Aguardando processamento...');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    console.log('\n🏁 Teste concluído');
    
  } catch (error) {
    console.error('❌ Erro:', error);
  } finally {
    if (channel) {
      await channel.close();
    }
    if (connection) {
      await connection.close();
    }
  }
}

testRawRabbitMQ().catch(console.error);