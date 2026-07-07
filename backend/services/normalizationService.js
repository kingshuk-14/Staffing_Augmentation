/**
 * Normalization Service
 * Used to normalize strings (skills, modules, domains, etc.) before deterministic backend matching.
 */

// A map of common synonyms or alternative spellings in the SAP / Tech domain.
const synonymMap = {
    // Basic Variations
    'sap ecc': 'sap_ecc',
    'ecc 6': 'sap_ecc',
    'ecc 6.0': 'sap_ecc',
    'ecc6': 'sap_ecc',
    'sap ecc 6.0': 'sap_ecc',
    'sap erp': 'sap_ecc',
    'ecc': 'sap_ecc',
    
    'sap s4 hana': 'sap_s4hana',
    's/4hana': 'sap_s4hana',
    's4hana': 'sap_s4hana',
    's4 hana': 'sap_s4hana',
    's/4 hana': 'sap_s4hana',
    'sap s/4hana': 'sap_s4hana',

    // Production Planning
    'production order': 'production_orders',
    'production orders': 'production_orders',
    'mrp': 'material_requirements_planning',
    'mrp live': 'material_requirements_planning_live',
    'material requirements planning': 'material_requirements_planning',
    'capacity planning': 'capacity_planning',
    'capacity scheduling': 'capacity_planning',
    'work center': 'work_centers',
    'work centers': 'work_centers',
    'routing': 'routings',
    'routings': 'routings',
    'shop floor control': 'shop_floor_control',
    'bom': 'bill_of_materials',
    'bill of materials': 'bill_of_materials',

    // Quality Management
    'inspection plan': 'inspection_plans',
    'inspection plans': 'inspection_plans',
    'quality notification': 'quality_notifications',
    'notifications': 'quality_notifications',
    'results recording': 'results_recording',

    // Modules
    'pp': 'production_planning',
    'sap pp': 'production_planning',
    'production planning': 'production_planning',
    
    'qm': 'quality_management',
    'sap qm': 'quality_management',
    'quality management': 'quality_management',

    'mm': 'materials_management',
    'sap mm': 'materials_management',
    'materials management': 'materials_management',
    
    'sd': 'sales_and_distribution',
    'sap sd': 'sales_and_distribution',
    'sales and distribution': 'sales_and_distribution',

    'fi': 'financial_accounting',
    'sap fi': 'financial_accounting',
    'fico': 'finance_and_controlling',
    'sap fico': 'finance_and_controlling',
    
    'co': 'controlling',
    'sap co': 'controlling',
    
    'pm': 'plant_maintenance',
    'sap pm': 'plant_maintenance',
    'plant maintenance': 'plant_maintenance',

    'abap': 'sap_abap',
    'sap abap': 'sap_abap',

    // Finance specific
    'universal journal': 'universal_journal',
    'asset accounting': 'asset_accounting',
    'gl': 'general_ledger',
    'general ledger': 'general_ledger',
    'ap': 'accounts_payable',
    'accounts payable': 'accounts_payable',
    'ar': 'accounts_receivable',
    'accounts receivable': 'accounts_receivable',
    'copa': 'profitability_analysis',
    'profitability analysis': 'profitability_analysis',
    'cost center': 'cost_center',
    'cost centre': 'cost_center',
    'internal order': 'internal_orders',
    'internal orders': 'internal_orders',
    'product costing': 'product_costing',

    // Master Data
    'master data': 'master_data',

    // Responsibilities / Experiences
    'requirement gathering': 'requirement_gathering',
    'business requirement gathering': 'requirement_gathering',
    'functional specification': 'functional_specifications',
    'functional specifications': 'functional_specifications',
    'functional specs': 'functional_specifications',
    'fs': 'functional_specifications',
    
    'go live': 'go_live',
    'go-live': 'go_live',
    'hypercare': 'hypercare',
    'production support': 'hypercare',
    
    'implementation': 'implementation',
    'rollout': 'rollout',
    'upgrade': 'upgrade',
    'migration': 'migration'
};

/**
 * Normalizes a single string.
 * - Converts to lowercase
 * - Trims whitespace
 * - Applies synonym mapping
 * - Replaces spaces and hyphens with underscores
 */
function normalizeString(str) {
    if (typeof str !== 'string') return '';
    
    // 1. Lowercase and trim
    let normalized = str.toLowerCase().trim();
    
    // 2. Initial punctuation stripping and singular/plural basic normalization (optional pass here before synonym)
    // We do simple s-stripping later or let synonym map handle it.
    
    // 3. Synonym mapping
    if (synonymMap[normalized]) {
        normalized = synonymMap[normalized];
    } else {
        // 4. Strip punctuation, replace spaces/hyphens with underscores
        normalized = normalized.replace(/[-\s]+/g, '_').replace(/[^\w_]/g, '');
        
        // Very basic plural normalization fallback (if ends with 's' and not double 's')
        if (normalized.endsWith('s') && !normalized.endsWith('ss')) {
            const singular = normalized.slice(0, -1);
            if (synonymMap[singular]) {
                normalized = synonymMap[singular];
            }
        }
    }
    
    return normalized;
}

/**
 * Takes an array of strings and returns a Set of normalized strings.
 * Filters out empty values.
 */
function normalizeArrayToSet(arr) {
    const set = new Set();
    if (!Array.isArray(arr)) return set;
    
    arr.forEach(item => {
        const norm = normalizeString(item);
        if (norm) set.add(norm);
    });
    
    return set;
}

module.exports = {
    normalizeString,
    normalizeArrayToSet,
    synonymMap
};
