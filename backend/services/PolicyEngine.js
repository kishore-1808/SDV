/**
 * Policy Engine - Evaluates access context to determine encryption strength.
 * 
 * Factors considered:
 *   1. User Role (admin, student, professor)
 *   2. Data Sensitivity Level (LOW, MEDIUM, HIGH, CRITICAL)
 *   3. Access Location (internal, external, remote)
 *   4. Time of Access (business hours vs off-hours)
 * 
 * Output: Encryption strategy (BASIC, STANDARD, STRONG)
 */

class PolicyEngine {
  static evaluate(context) {
    const { role, sensitivityLevel, location, timestamp } = context;

    let score = 0;
    const reasons = [];

    switch (sensitivityLevel) {
      case 'CRITICAL':
        score += 40;
        reasons.push('CRITICAL sensitivity data (+40)');
        break;
      case 'HIGH':
        score += 30;
        reasons.push('HIGH sensitivity data (+30)');
        break;
      case 'MEDIUM':
        score += 20;
        reasons.push('MEDIUM sensitivity data (+20)');
        break;
      case 'LOW':
        score += 10;
        reasons.push('LOW sensitivity data (+10)');
        break;
      default:
        score += 20;
        reasons.push('Unknown sensitivity, defaulting to MEDIUM (+20)');
    }

    switch (role) {
      case 'professor':
        score += 20;
        reasons.push('Professor role - higher encryption needed (+20)');
        break;
      case 'student':
        score += 10;
        reasons.push('Student role - standard encryption (+10)');
        break;
      case 'admin':
        score += 5;
        reasons.push('Admin role - trusted access (+5)');
        break;
      default:
        score += 20;
        reasons.push('Unknown role, treating as professor (+20)');
    }

    switch (location) {
      case 'remote':
        score += 20;
        reasons.push('Remote access - highest risk (+20)');
        break;
      case 'external':
        score += 15;
        reasons.push('External access - elevated risk (+15)');
        break;
      case 'internal':
        score += 5;
        reasons.push('Internal access - low risk (+5)');
        break;
      default:
        score += 15;
        reasons.push('Unknown location, treating as external (+15)');
    }

    const hour = timestamp ? new Date(timestamp).getHours() : new Date().getHours();
    if (hour >= 9 && hour <= 17) {
      score += 0;
      reasons.push('Business hours access (+0)');
    } else if (hour >= 6 && hour <= 21) {
      score += 5;
      reasons.push('Extended hours access (+5)');
    } else {
      score += 15;
      reasons.push('Off-hours access - suspicious (+15)');
    }

    let strategy;
    if (score >= 60) {
      strategy = 'STRONG';
    } else if (score >= 35) {
      strategy = 'STANDARD';
    } else {
      strategy = 'BASIC';
    }

    return { strategy, score, reasons, evaluatedAt: new Date().toISOString() };
  }

  static checkAccess(role, sensitivityLevel) {
    const accessMatrix = {
      admin: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      student: ['LOW', 'MEDIUM', 'HIGH'],
      professor: ['LOW']
    };

    const allowed = accessMatrix[role] || [];
    return {
      granted: allowed.includes(sensitivityLevel),
      allowedLevels: allowed,
      message: allowed.includes(sensitivityLevel)
        ? `Access granted: ${role} can access ${sensitivityLevel} data`
        : `Access denied: ${role} cannot access ${sensitivityLevel} data`
    };
  }
}

module.exports = PolicyEngine;
