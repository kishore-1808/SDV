/**
 * Policy Engine - Evaluates access context to determine encryption strength.
 * 
 * Factors considered:
 *   1. User Role (admin, employee, guest)
 *   2. Data Sensitivity Level (LOW, MEDIUM, HIGH, CRITICAL)
 *   3. Access Location (internal, external, remote)
 *   4. Time of Access (business hours vs off-hours)
 * 
 * Output: Encryption strategy (BASIC, STANDARD, STRONG)
 */

class PolicyEngine {
  /**
   * Evaluate context and return the required encryption strategy.
   * @param {Object} context - { role, sensitivityLevel, location, timestamp }
   * @returns {Object} - { strategy, reason, score }
   */
  static evaluate(context) {
    const { role, sensitivityLevel, location, timestamp } = context;

    let score = 0;
    const reasons = [];

    // --- Factor 1: Data Sensitivity Level (highest weight) ---
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

    // --- Factor 2: User Role ---
    switch (role) {
      case 'guest':
        score += 20;
        reasons.push('Guest role - higher encryption needed (+20)');
        break;
      case 'employee':
        score += 10;
        reasons.push('Employee role - standard encryption (+10)');
        break;
      case 'admin':
        score += 5;
        reasons.push('Admin role - trusted access (+5)');
        break;
      default:
        score += 20;
        reasons.push('Unknown role, treating as guest (+20)');
    }

    // --- Factor 3: Access Location ---
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

    // --- Factor 4: Time of Access ---
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

    // --- Determine Encryption Strategy ---
    let strategy;
    if (score >= 60) {
      strategy = 'STRONG';
    } else if (score >= 35) {
      strategy = 'STANDARD';
    } else {
      strategy = 'BASIC';
    }

    return {
      strategy,
      score,
      reasons,
      evaluatedAt: new Date().toISOString()
    };
  }

  /**
   * Check if a user role can access a given sensitivity level.
   * Implements zero-trust access control.
   */
  static checkAccess(role, sensitivityLevel) {
    const accessMatrix = {
      admin: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      employee: ['LOW', 'MEDIUM', 'HIGH'],
      guest: ['LOW']
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
