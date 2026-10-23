const { SdkRabbitmq } = require('../dist/index');

// Memória global para controlar o fluxo
const globalMemory = {
  flow: ['greeting', 'patientName', 'patientCPF', 'patientEmail'],
  currentStep: {},
  userData: {}
};

// Definição dos agentes
const GreetingAgent = {
  routingKeyAgent: 'greeting',
  name: 'GreetingAgent'
};

const PatientNameAgent = {
  routingKeyAgent: 'patientName',
  name: 'PatientNameAgent'
};

const PatientCPFAgent = {
  routingKeyAgent: 'patientCPF',
  name: 'PatientCPFAgent'
};

const PatientEmailAgent = {
  routingKeyAgent: 'patientEmail',
  name: 'PatientEmailAgent'
};

// Função para obter o próximo agente no fluxo
function getNextAgent(currentAgent) {
  const currentIndex = globalMemory.flow.indexOf(currentAgent);
  if (currentIndex >= 0 && currentIndex < globalMemory.flow.length - 1) {
    return globalMemory.flow[currentIndex + 1];
  }
  return null;
}

// Função para marcar sucesso na memória global
function markStepAsSuccess(phone, step, value) {
  if (!globalMemory.currentStep[phone]) {
    globalMemory.currentStep[phone] = {};
  }
  if (!globalMemory.userData[phone]) {
    globalMemory.userData[phone] = {};
  }
  
  globalMemory.currentStep[phone][step] = 'success';
  globalMemory.userData[phone][step] = value;
  
  console.log(`✅ Step ${step} marked as success for phone ${phone}`);
  console.log(`📊 Global Memory:`, JSON.stringify(globalMemory, null, 2));
}

// Função para simular processamento de dados
function simulateDataProcessing(agentName, phone) {
  const mockData = {
    'GreetingAgent': `Olá! Bem-vindo ao nosso sistema de atendimento. Telefone: ${phone}`,
    'PatientNameAgent': `João Silva`,
    'PatientCPFAgent': `123.456.789-00`,
    'PatientEmailAgent': `joao.silva@email.com`
  };
  
  return mockData[agentName] || `Dados processados por ${agentName}`;
}

// Classe base para os agentes
class BaseAgent {
  constructor(config, sdk) {
    this.config = config;
    this.sdk = sdk;
    this.name = config.name;
    this.routingKeyAgent = config.routingKeyAgent;
  }

  async processMessage(payload, ack, nack) {
    try {
      console.log(`\n🤖 ${this.name} processando mensagem:`, payload);
      
      const phone = payload.phone;
      const processedValue = simulateDataProcessing(this.name, phone);
      
      // Simular processamento
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Marcar como sucesso na memória global
      markStepAsSuccess(phone, this.routingKeyAgent, processedValue);
      
      // Fazer unbind da routing key específica do telefone
      const specificRoutingKey = `phone.${phone}`;
      if (this.name !== 'GreetingAgent') {
        try {
          await this.sdk.unbind(`queue-${this.routingKeyAgent}`, 'chatbot.whatsapp', specificRoutingKey);
          console.log(`🔓 ${this.name} fez unbind da routing key: ${specificRoutingKey}`);
        } catch (error) {
          console.log(`⚠️ Erro ao fazer unbind: ${error.message}`);
        }
      }
      
      // Obter próximo agente
      const nextAgentKey = getNextAgent(this.routingKeyAgent);
      
      if (nextAgentKey) {
        // Preparar payload para próximo agente
        const nextPayload = {
          phone: phone,
          timestamp: Date.now(),
          metadata: {
            identification: this.routingKeyAgent,
            senderAgent: this.name,
            value: processedValue
          }
        };
        
        console.log(`📤 ${this.name} enviando para próximo agente: ${nextAgentKey}`);
        
        // Enviar para o próximo agente via exchange chatbot.agents
        await this.sdk.publish('chatbot.agents', nextAgentKey, nextPayload);
      } else {
        console.log(`🏁 ${this.name} finalizou o fluxo para o telefone ${phone}`);
        
        // Enviar resultado final via whatsapp.message.text
        const finalPayload = {
          phone: phone,
          timestamp: Date.now(),
          metadata: {
            identification: 'flow_completed',
            senderAgent: this.name,
            value: 'Fluxo completo finalizado',
            userData: globalMemory.userData[phone]
          }
        };
        
        await this.sdk.publish('whatsapp.message.text', 'send', finalPayload);
      }
      
      ack();
    } catch (error) {
      console.error(`❌ Erro no ${this.name}:`, error);
      nack();
    }
  }
}

// Implementação específica do GreetingAgent
class GreetingAgentImpl extends BaseAgent {
  async start() {
    console.log(`🚀 Iniciando ${this.name}...`);
    
    // GreetingAgent escuta phone.* na exchange chatbot.whatsapp
    await this.sdk.subscribe(
      'chatbot.whatsapp',
      `queue-${this.routingKeyAgent}`,
      'phone.*',
      this.processMessage.bind(this)
    );
    
    console.log(`👂 ${this.name} ouvindo na exchange: chatbot.whatsapp, routing key: phone.*`);
  }
}

// Implementação dos outros agentes
class DynamicAgent extends BaseAgent {
  async start() {
    console.log(`🚀 Iniciando ${this.name}...`);
    
    // Outros agentes escutam na exchange chatbot.agents
    await this.sdk.subscribe(
      'chatbot.agents',
      `queue-${this.routingKeyAgent}`,
      this.routingKeyAgent,
      async (payload, ack, nack) => {
        // Fazer bind específico para o telefone do usuário
        const phone = payload.phone;
        const specificRoutingKey = `phone.${phone}`;
        
        try {
          await this.sdk.bind(`queue-${this.routingKeyAgent}`, 'chatbot.whatsapp', specificRoutingKey);
          console.log(`🔒 ${this.name} fez bind para routing key: ${specificRoutingKey}`);
          
          // Processar a mensagem
          await this.processMessage(payload, ack, nack);
        } catch (error) {
          console.error(`❌ Erro no bind/processamento do ${this.name}:`, error);
          nack();
        }
      }
    );
    
    console.log(`👂 ${this.name} ouvindo na exchange: chatbot.agents, routing key: ${this.routingKeyAgent}`);
  }
}

// Função principal de teste
async function testDynamicRoutingFlow() {
  console.log('🎯 Iniciando teste de fluxo de roteamento dinâmico...\n');
  
  let sdk;
  
  try {
    // Inicializar SDK
    sdk = await SdkRabbitmq.getInstance();
    console.log('✅ SDK inicializado com sucesso\n');
    
    // Criar exchanges topic
    console.log('📡 Criando exchanges...');
    // As exchanges serão criadas automaticamente pelo SDK quando necessário
    
    // Configurar subscriber para monitoramento (whatsapp.message.text)
    console.log('👂 Configurando subscriber de monitoramento...');
    await sdk.subscribe(
      'whatsapp.message.text',
      'monitor-queue',
      'send',
      (payload, ack, nack) => {
        console.log('\n📱 MENSAGEM RECEBIDA NO MONITOR:');
        console.log('📄 Payload:', JSON.stringify(payload, null, 2));
        console.log('🕐 Timestamp:', new Date(payload.timestamp).toLocaleString());
        ack();
      }
    );
    
    // Inicializar agentes
    console.log('\n🤖 Inicializando agentes...');
    
    const greetingAgent = new GreetingAgentImpl(GreetingAgent, sdk);
    await greetingAgent.start();
    
    const patientNameAgent = new DynamicAgent(PatientNameAgent, sdk);
    await patientNameAgent.start();
    
    const patientCPFAgent = new DynamicAgent(PatientCPFAgent, sdk);
    await patientCPFAgent.start();
    
    const patientEmailAgent = new DynamicAgent(PatientEmailAgent, sdk);
    await patientEmailAgent.start();
    
    console.log('\n✅ Todos os agentes inicializados!\n');
    
    // Aguardar um pouco para garantir que tudo está configurado
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Simular chegada de mensagens de diferentes telefones
    console.log('📞 Simulando chegada de mensagens...\n');
    
    const testPhones = ['5511999999999', '5511888888888'];
    
    for (const phone of testPhones) {
      console.log(`\n🔥 Iniciando fluxo para telefone: ${phone}`);
      
      const initialPayload = {
        phone: phone,
        timestamp: Date.now(),
        metadata: {
          identification: 'initial',
          senderAgent: 'TestSystem',
          value: 'Mensagem inicial do WhatsApp'
        }
      };
      
      // Enviar mensagem inicial para GreetingAgent
      await sdk.publish('chatbot.whatsapp', `phone.${phone}`, initialPayload);
      
      // Aguardar um pouco entre os telefones
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    
    // Aguardar processamento completo
    console.log('\n⏳ Aguardando processamento completo...');
    await new Promise(resolve => setTimeout(resolve, 15000));
    
    console.log('\n🎉 Teste concluído!');
    console.log('\n📊 Estado final da memória global:');
    console.log(JSON.stringify(globalMemory, null, 2));
    
  } catch (error) {
    console.error('❌ Erro durante o teste:', error);
  } finally {
    if (sdk) {
      console.log('\n🔌 Desconectando SDK...');
      await sdk.disconnect();
    }
  }
}

// Executar teste se este arquivo for executado diretamente
if (require.main === module) {
  testDynamicRoutingFlow().catch(console.error);
}

module.exports = {
  testDynamicRoutingFlow,
  GreetingAgent,
  PatientNameAgent,
  PatientCPFAgent,
  PatientEmailAgent,
  globalMemory
};