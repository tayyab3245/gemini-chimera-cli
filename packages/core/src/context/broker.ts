import { AgentType } from '../event-bus/types.js';
import { stripMarkdown, pickFields } from './filters.js';

export interface ContextSlice {
  userInput?: string;
  planJson?: string;
  planStep?: string;
  artifacts?: string[];
}

export function buildContextSlice(agent: AgentType, raw: {
  userInput: string;
  planJson: string;
  planStep?: string;
  artifacts: string[];
}): ContextSlice {
  // Clean markdown from userInput if it's a string
  const cleanUserInput = typeof raw.userInput === 'string' ? stripMarkdown(raw.userInput) : raw.userInput;
  
  // Create cleaned raw object
  const cleanedRaw = {
    ...raw,
    userInput: cleanUserInput
  };

  // Filter fields based on agent type
  let filtered: ContextSlice;
  
  switch (agent) {
    case AgentType.KERNEL:
      // KERNEL gets all fields
      filtered = cleanedRaw;
      break;
      
    case AgentType.SYNTH:
      // SYNTH gets userInput and planJson
      filtered = pickFields(cleanedRaw, ['userInput', 'planJson']);
      break;
      
    case AgentType.DRIVE:
      // DRIVE gets planStep and artifacts
      filtered = pickFields(cleanedRaw, ['planStep', 'artifacts']);
      break;
      
    case AgentType.AUDIT:
      // AUDIT gets planJson and artifacts
      filtered = pickFields(cleanedRaw, ['planJson', 'artifacts']);
      break;
      
    default:
      // Unknown agent gets nothing
      filtered = {};
      break;
  }
  
  return filtered;
}

// Inline smoke test
if (import.meta.url === `file://${process.argv[1]}` || import.meta.url.endsWith('broker.js')) {
  function runSmokeTests() {
    const mockRaw = {
      userInput: '# Hello\nThis is **bold** text.',
      planJson: '{"step": "test"}',
      planStep: 'execute something',
      artifacts: ['file1.txt', 'file2.txt']
    };

    // Test KERNEL - should get all fields with cleaned userInput
    const kernelSlice = buildContextSlice(AgentType.KERNEL, mockRaw);
    if (!kernelSlice.userInput || kernelSlice.userInput.includes('#') || kernelSlice.userInput.includes('**')) {
      throw new Error('KERNEL: userInput not properly cleaned');
    }
    if (!kernelSlice.planJson || !kernelSlice.planStep || !kernelSlice.artifacts) {
      throw new Error('KERNEL: missing required fields');
    }

    // Test SYNTH - should only get userInput and planJson
    const synthSlice = buildContextSlice(AgentType.SYNTH, mockRaw);
    if (!synthSlice.userInput || !synthSlice.planJson) {
      throw new Error('SYNTH: missing allowed fields');
    }
    if (synthSlice.planStep || synthSlice.artifacts) {
      throw new Error('SYNTH: has forbidden fields');
    }

    // Test DRIVE - should only get planStep and artifacts
    const driveSlice = buildContextSlice(AgentType.DRIVE, mockRaw);
    if (!driveSlice.planStep || !driveSlice.artifacts) {
      throw new Error('DRIVE: missing allowed fields');
    }
    if (driveSlice.userInput || driveSlice.planJson) {
      throw new Error('DRIVE: has forbidden fields');
    }

    // Test AUDIT - should only get planJson and artifacts
    const auditSlice = buildContextSlice(AgentType.AUDIT, mockRaw);
    if (!auditSlice.planJson || !auditSlice.artifacts) {
      throw new Error('AUDIT: missing allowed fields');
    }
    if (auditSlice.userInput || auditSlice.planStep) {
      throw new Error('AUDIT: has forbidden fields');
    }

    console.log('Context broker smoke-tests passed ✅');
  }

  runSmokeTests();
}
