#!/usr/bin/env python3
"""Generate a .cypher file with realistic cosmetics R&D data for Neo4j + n20s demo."""

import random
import textwrap

random.seed(42)

# ---------------------------------------------------------------------------
# 1. CATEGORIES (functional roles)
# ---------------------------------------------------------------------------
CATEGORIES = [
    "Humectant", "Emollient", "RetinoidAgent", "RetinoidAlternative",
    "Antioxidant", "AHAExfoliant", "BHAExfoliant", "UVFilter",
    "Preservative", "Surfactant", "Thickener", "VitaminDerivative",
    "PlantExtract", "Peptide", "Ceramide", "FragranceComponent",
]

# ---------------------------------------------------------------------------
# 2. INGREDIENTS — real INCI names, CAS numbers, categories, cost ranges
#    Format: (name, inci, cas, category, cost_low, cost_high, rdf_classes, reg_dict)
#    rdf_classes: list of cosmo: OWL classes
#    reg_dict: {market: max_concentration} or None
# ---------------------------------------------------------------------------
INGREDIENTS = [
    # --- Humectants ---
    ("Hyaluronic Acid", "SODIUM HYALURONATE", "9067-32-7", "Humectant", 80, 200, ["Humectant", "Biopolymer"], None),
    ("Glycerin", "GLYCERIN", "56-81-5", "Humectant", 2, 8, ["Humectant", "Polyol"], None),
    ("Betaine", "BETAINE", "107-43-7", "Humectant", 5, 15, ["Humectant", "AminoAcidDerivative"], None),
    ("Panthenol", "PANTHENOL", "81-13-0", "Humectant", 15, 40, ["Humectant", "VitaminDerivative", "VitaminB5Derivative"], None),
    ("Sodium PCA", "SODIUM PCA", "28874-51-3", "Humectant", 10, 25, ["Humectant", "AminoAcidDerivative"], None),
    ("Urea", "UREA", "57-13-6", "Humectant", 3, 10, ["Humectant", "Keratolytic"], None),
    ("Propylene Glycol", "PROPYLENE GLYCOL", "57-55-6", "Humectant", 2, 6, ["Humectant", "Polyol", "Solvent"], None),
    ("Butylene Glycol", "BUTYLENE GLYCOL", "107-88-0", "Humectant", 3, 8, ["Humectant", "Polyol", "Solvent"], None),
    ("Trehalose", "TREHALOSE", "99-20-7", "Humectant", 12, 30, ["Humectant", "Saccharide"], None),
    ("Aloe Vera Gel", "ALOE BARBADENSIS LEAF JUICE", "85507-69-3", "Humectant", 5, 20, ["Humectant", "PlantExtract"], None),

    # --- Emollients ---
    ("Squalane", "SQUALANE", "111-01-3", "Emollient", 15, 50, ["Emollient", "Hydrocarbon"], None),
    ("Jojoba Oil", "SIMMONDSIA CHINENSIS SEED OIL", "61789-91-1", "Emollient", 10, 35, ["Emollient", "WaxEster", "PlantOil"], None),
    ("Shea Butter", "BUTYROSPERMUM PARKII BUTTER", "194043-92-0", "Emollient", 5, 20, ["Emollient", "PlantButter"], None),
    ("Argan Oil", "ARGANIA SPINOSA KERNEL OIL", "223747-87-1", "Emollient", 20, 60, ["Emollient", "PlantOil"], None),
    ("Dimethicone", "DIMETHICONE", "9006-65-9", "Emollient", 5, 15, ["Emollient", "Silicone"], None),
    ("Cetyl Alcohol", "CETYL ALCOHOL", "36653-82-4", "Emollient", 3, 10, ["Emollient", "FattyAlcohol"], None),
    ("Caprylic Triglyceride", "CAPRYLIC/CAPRIC TRIGLYCERIDE", "65381-09-1", "Emollient", 5, 18, ["Emollient", "Triglyceride"], None),
    ("Isopropyl Myristate", "ISOPROPYL MYRISTATE", "110-27-0", "Emollient", 3, 12, ["Emollient", "Ester"], None),
    ("Cocoa Butter", "THEOBROMA CACAO SEED BUTTER", "8002-31-1", "Emollient", 6, 18, ["Emollient", "PlantButter"], None),
    ("Avocado Oil", "PERSEA GRATISSIMA OIL", "8024-32-6", "Emollient", 8, 25, ["Emollient", "PlantOil"], None),
    ("Sweet Almond Oil", "PRUNUS AMYGDALUS DULCIS OIL", "8007-69-0", "Emollient", 6, 20, ["Emollient", "PlantOil"], None),
    ("Rosehip Oil", "ROSA CANINA FRUIT OIL", "84603-93-0", "Emollient", 15, 45, ["Emollient", "PlantOil"], None),
    ("Sunflower Seed Oil", "HELIANTHUS ANNUUS SEED OIL", "8001-21-6", "Emollient", 3, 10, ["Emollient", "PlantOil"], None),

    # --- Retinoid Agents ---
    ("Retinol", "RETINOL", "68-26-8", "RetinoidAgent", 100, 400, ["RetinoidAgent", "PhotosensitiveAgent", "VitaminADerivative"], {"EU": 0.05, "China": 0.5, "Japan": 0.25}),
    ("Retinal", "RETINAL", "116-31-4", "RetinoidAgent", 150, 500, ["RetinoidAgent", "PhotosensitiveAgent", "VitaminADerivative", "Aldehyde"], {"EU": 0.05, "China": 0.5}),
    ("Retinyl Palmitate", "RETINYL PALMITATE", "79-81-2", "RetinoidAgent", 40, 120, ["RetinoidAgent", "VitaminADerivative", "Ester"], {"EU": 0.05}),
    ("Hydroxypinacolone Retinoate", "HYDROXYPINACOLONE RETINOATE", "893412-73-2", "RetinoidAgent", 200, 600, ["RetinoidAgent", "VitaminADerivative", "Ester"], {"EU": 0.2}),
    ("Retinyl Retinoate", "RETINYL RETINOATE", "97553-24-5", "RetinoidAgent", 250, 700, ["RetinoidAgent", "VitaminADerivative"], None),

    # --- Retinoid Alternatives ---
    ("Bakuchiol", "BAKUCHIOL", "10309-37-2", "RetinoidAlternative", 60, 200, ["RetinoidAlternative", "PlantExtract", "Meroterpene"], None),
    ("Moth Bean Extract", "VIGNA ACONITIFOLIA SEED EXTRACT", "N/A", "RetinoidAlternative", 40, 100, ["RetinoidAlternative", "PlantExtract"], None),
    ("Rambutan Extract", "NEPHELIUM LAPPACEUM PEEL EXTRACT", "N/A", "RetinoidAlternative", 50, 120, ["RetinoidAlternative", "PlantExtract"], None),

    # --- Antioxidants ---
    ("Tocopherol", "TOCOPHEROL", "59-02-9", "Antioxidant", 10, 40, ["Antioxidant", "VitaminEDerivative"], None),
    ("Ascorbic Acid", "ASCORBIC ACID", "50-81-7", "Antioxidant", 8, 30, ["Antioxidant", "VitaminCDerivative", "pHSensitiveAgent"], None),
    ("Ferulic Acid", "FERULIC ACID", "1135-24-6", "Antioxidant", 30, 100, ["Antioxidant", "PhenolicAcid"], None),
    ("Resveratrol", "RESVERATROL", "501-36-0", "Antioxidant", 50, 180, ["Antioxidant", "Polyphenol", "PlantExtract"], None),
    ("Astaxanthin", "ASTAXANTHIN", "472-61-7", "Antioxidant", 80, 250, ["Antioxidant", "Carotenoid"], None),
    ("Coenzyme Q10", "UBIQUINONE", "303-98-0", "Antioxidant", 40, 150, ["Antioxidant", "Quinone"], None),
    ("Green Tea Extract", "CAMELLIA SINENSIS LEAF EXTRACT", "84650-60-2", "Antioxidant", 10, 35, ["Antioxidant", "PlantExtract", "Polyphenol"], None),
    ("Alpha Lipoic Acid", "THIOCTIC ACID", "1077-28-7", "Antioxidant", 25, 80, ["Antioxidant", "SulfurCompound"], None),
    ("Glutathione", "GLUTATHIONE", "70-18-8", "Antioxidant", 60, 200, ["Antioxidant", "Peptide", "SulfurCompound"], None),
    ("Superoxide Dismutase", "SUPEROXIDE DISMUTASE", "9054-89-1", "Antioxidant", 100, 350, ["Antioxidant", "Enzyme"], None),

    # --- AHA Exfoliants ---
    ("Glycolic Acid", "GLYCOLIC ACID", "79-14-1", "AHAExfoliant", 8, 25, ["AHAExfoliant", "Keratolytic", "pHSensitiveAgent"], {"EU": 0.10, "China": 0.06}),
    ("Lactic Acid", "LACTIC ACID", "50-21-5", "AHAExfoliant", 5, 18, ["AHAExfoliant", "Keratolytic"], {"EU": 0.10}),
    ("Mandelic Acid", "MANDELIC ACID", "90-64-2", "AHAExfoliant", 15, 40, ["AHAExfoliant", "Keratolytic"], None),
    ("Tartaric Acid", "TARTARIC ACID", "87-69-4", "AHAExfoliant", 6, 15, ["AHAExfoliant", "Keratolytic"], None),
    ("Malic Acid", "MALIC ACID", "6915-15-7", "AHAExfoliant", 5, 15, ["AHAExfoliant", "Keratolytic"], None),
    ("Citric Acid", "CITRIC ACID", "77-92-9", "AHAExfoliant", 3, 10, ["AHAExfoliant", "Keratolytic", "pHAdjuster"], None),

    # --- BHA Exfoliants ---
    ("Salicylic Acid", "SALICYLIC ACID", "69-72-7", "BHAExfoliant", 8, 25, ["BHAExfoliant", "Keratolytic", "AntiInflammatory"], {"EU": 0.02, "US": 0.02, "China": 0.02}),
    ("Betaine Salicylate", "BETAINE SALICYLATE", "17671-53-3", "BHAExfoliant", 20, 50, ["BHAExfoliant", "Keratolytic"], None),

    # --- UV Filters ---
    ("Zinc Oxide", "ZINC OXIDE", "1314-13-2", "UVFilter", 5, 20, ["UVFilter", "MineralFilter", "InorganicAgent"], {"EU": 0.25, "US": 0.25}),
    ("Titanium Dioxide", "TITANIUM DIOXIDE", "13463-67-7", "UVFilter", 5, 18, ["UVFilter", "MineralFilter", "InorganicAgent"], {"EU": 0.25, "US": 0.25}),
    ("Avobenzone", "BUTYL METHOXYDIBENZOYLMETHANE", "70356-09-1", "UVFilter", 10, 30, ["UVFilter", "ChemicalFilter", "PhotounstableAgent"], {"EU": 0.05, "US": 0.03}),
    ("Octinoxate", "ETHYLHEXYL METHOXYCINNAMATE", "5466-77-3", "UVFilter", 8, 22, ["UVFilter", "ChemicalFilter"], {"EU": 0.10, "US": 0.075}),
    ("Octocrylene", "OCTOCRYLENE", "6197-30-4", "UVFilter", 8, 25, ["UVFilter", "ChemicalFilter"], {"EU": 0.10}),
    ("Tinosorb S", "BIS-ETHYLHEXYLOXYPHENOL METHOXYPHENYL TRIAZINE", "187393-00-6", "UVFilter", 15, 40, ["UVFilter", "ChemicalFilter"], {"EU": 0.10}),
    ("Tinosorb M", "METHYLENE BIS-BENZOTRIAZOLYL TETRAMETHYLBUTYLPHENOL", "103597-45-1", "UVFilter", 15, 40, ["UVFilter", "ChemicalFilter"], {"EU": 0.10}),
    ("Uvinul A Plus", "DIETHYLAMINO HYDROXYBENZOYL HEXYL BENZOATE", "302776-68-7", "UVFilter", 12, 35, ["UVFilter", "ChemicalFilter"], {"EU": 0.10}),

    # --- Preservatives ---
    ("Phenoxyethanol", "PHENOXYETHANOL", "122-99-6", "Preservative", 5, 15, ["Preservative", "GlycolEther"], {"EU": 0.01, "US": 0.01, "China": 0.01, "Japan": 0.01}),
    ("Potassium Sorbate", "POTASSIUM SORBATE", "24634-61-5", "Preservative", 3, 10, ["Preservative", "OrganicSalt"], {"EU": 0.006}),
    ("Sodium Benzoate", "SODIUM BENZOATE", "532-32-1", "Preservative", 3, 10, ["Preservative", "OrganicSalt"], {"EU": 0.025}),
    ("Ethylhexylglycerin", "ETHYLHEXYLGLYCERIN", "70445-33-9", "Preservative", 8, 20, ["Preservative", "GlycolEther"], None),
    ("Tocopheryl Acetate", "TOCOPHERYL ACETATE", "58-95-7", "Preservative", 8, 25, ["Preservative", "Antioxidant", "VitaminEDerivative"], None),
    ("Caprylyl Glycol", "CAPRYLYL GLYCOL", "1117-86-8", "Preservative", 10, 30, ["Preservative", "GlycolEther"], None),

    # --- Surfactants ---
    ("Polysorbate 20", "POLYSORBATE 20", "9005-64-5", "Surfactant", 4, 12, ["Surfactant", "NonionicSurfactant", "Emulsifier"], None),
    ("Cetearyl Glucoside", "CETEARYL GLUCOSIDE", "246159-33-1", "Surfactant", 8, 25, ["Surfactant", "NonionicSurfactant", "Emulsifier"], None),
    ("Polysorbate 80", "POLYSORBATE 80", "9005-65-6", "Surfactant", 4, 14, ["Surfactant", "NonionicSurfactant", "Emulsifier"], None),
    ("Sodium Lauryl Sulfate", "SODIUM LAURYL SULFATE", "151-21-3", "Surfactant", 2, 8, ["Surfactant", "AnionicSurfactant", "IrritantRisk"], None),
    ("Cocamidopropyl Betaine", "COCAMIDOPROPYL BETAINE", "61789-40-0", "Surfactant", 4, 12, ["Surfactant", "AmphotericSurfactant"], None),
    ("Decyl Glucoside", "DECYL GLUCOSIDE", "68515-73-1", "Surfactant", 5, 15, ["Surfactant", "NonionicSurfactant"], None),
    ("Lecithin", "LECITHIN", "8002-43-5", "Surfactant", 6, 20, ["Surfactant", "Phospholipid", "Emulsifier"], None),

    # --- Thickeners ---
    ("Xanthan Gum", "XANTHAN GUM", "11138-66-2", "Thickener", 5, 15, ["Thickener", "Polysaccharide", "RheologyModifier"], None),
    ("Carbomer", "CARBOMER", "9003-01-4", "Thickener", 8, 20, ["Thickener", "SyntheticPolymer", "RheologyModifier"], None),
    ("Hydroxyethyl Cellulose", "HYDROXYETHYLCELLULOSE", "9004-62-0", "Thickener", 5, 15, ["Thickener", "CelluloseDerivative", "RheologyModifier"], None),
    ("Cellulose Gum", "CELLULOSE GUM", "9004-32-4", "Thickener", 4, 12, ["Thickener", "CelluloseDerivative"], None),
    ("Acrylates Copolymer", "ACRYLATES COPOLYMER", "25035-69-2", "Thickener", 6, 18, ["Thickener", "SyntheticPolymer"], None),
    ("Guar Gum", "GUAR GUM", "9000-30-0", "Thickener", 4, 12, ["Thickener", "Polysaccharide"], None),

    # --- Vitamin Derivatives ---
    ("Niacinamide", "NIACINAMIDE", "98-92-0", "VitaminDerivative", 10, 35, ["VitaminDerivative", "VitaminB3Derivative", "SkinBrightener"], None),
    ("Ascorbyl Glucoside", "ASCORBYL GLUCOSIDE", "129499-78-1", "VitaminDerivative", 30, 100, ["VitaminDerivative", "VitaminCDerivative", "Antioxidant"], None),
    ("Sodium Ascorbyl Phosphate", "SODIUM ASCORBYL PHOSPHATE", "66170-10-3", "VitaminDerivative", 25, 80, ["VitaminDerivative", "VitaminCDerivative", "Antioxidant"], None),
    ("Pyridoxine HCl", "PYRIDOXINE HCL", "58-56-0", "VitaminDerivative", 8, 25, ["VitaminDerivative", "VitaminB6Derivative"], None),
    ("Biotin", "BIOTIN", "58-85-5", "VitaminDerivative", 30, 90, ["VitaminDerivative", "VitaminB7Derivative"], None),
    ("Tocotrienols", "TOCOTRIENOLS", "6829-55-6", "VitaminDerivative", 40, 120, ["VitaminDerivative", "VitaminEDerivative", "Antioxidant"], None),
    ("Ascorbyl Tetraisopalmitate", "ASCORBYL TETRAISOPALMITATE", "183476-82-6", "VitaminDerivative", 50, 150, ["VitaminDerivative", "VitaminCDerivative", "OilSoluble"], None),

    # --- Plant Extracts ---
    ("Centella Asiatica", "CENTELLA ASIATICA EXTRACT", "84696-21-9", "PlantExtract", 15, 50, ["PlantExtract", "WoundHealingAgent"], None),
    ("Licorice Root Extract", "GLYCYRRHIZA GLABRA ROOT EXTRACT", "68916-91-6", "PlantExtract", 10, 35, ["PlantExtract", "AntiInflammatory", "SkinBrightener"], None),
    ("Chamomile Extract", "CHAMOMILLA RECUTITA FLOWER EXTRACT", "84082-60-0", "PlantExtract", 8, 25, ["PlantExtract", "AntiInflammatory", "Soothing"], None),
    ("Turmeric Extract", "CURCUMA LONGA ROOT EXTRACT", "84775-52-0", "PlantExtract", 10, 30, ["PlantExtract", "Antioxidant", "AntiInflammatory"], None),
    ("Witch Hazel", "HAMAMELIS VIRGINIANA EXTRACT", "84696-19-5", "PlantExtract", 5, 18, ["PlantExtract", "Astringent"], None),
    ("Ginseng Extract", "PANAX GINSENG ROOT EXTRACT", "50647-08-0", "PlantExtract", 15, 50, ["PlantExtract", "Adaptogen"], None),
    ("Sea Buckthorn Oil", "HIPPOPHAE RHAMNOIDES FRUIT OIL", "225234-03-7", "PlantExtract", 20, 60, ["PlantExtract", "Emollient", "Antioxidant"], None),
    ("Calendula Extract", "CALENDULA OFFICINALIS FLOWER EXTRACT", "84776-23-8", "PlantExtract", 8, 25, ["PlantExtract", "Soothing", "WoundHealingAgent"], None),
    ("Willowherb Extract", "EPILOBIUM ANGUSTIFOLIUM FLOWER EXTRACT", "84625-36-5", "PlantExtract", 12, 35, ["PlantExtract", "AntiInflammatory"], None),
    ("Magnolia Bark Extract", "MAGNOLIA OFFICINALIS BARK EXTRACT", "97722-15-3", "PlantExtract", 15, 45, ["PlantExtract", "Antioxidant", "Soothing"], None),
    ("Pomegranate Extract", "PUNICA GRANATUM EXTRACT", "84961-57-9", "PlantExtract", 12, 40, ["PlantExtract", "Antioxidant", "Polyphenol"], None),
    ("Mushroom Extract", "GANODERMA LUCIDUM EXTRACT", "223748-19-2", "PlantExtract", 18, 55, ["PlantExtract", "Adaptogen", "Antioxidant"], None),

    # --- Peptides ---
    ("Matrixyl", "PALMITOYL PENTAPEPTIDE-4", "214047-00-4", "Peptide", 80, 300, ["Peptide", "SignalPeptide", "AntiWrinkle"], None),
    ("Argireline", "ACETYL HEXAPEPTIDE-3", "616204-22-9", "Peptide", 100, 350, ["Peptide", "NeurotransmitterInhibitor", "AntiWrinkle"], None),
    ("Copper Peptide", "COPPER TRIPEPTIDE-1", "49557-75-7", "Peptide", 120, 400, ["Peptide", "SignalPeptide", "WoundHealingAgent"], None),
    ("Snap-8", "ACETYL OCTAPEPTIDE-3", "868844-74-0", "Peptide", 90, 300, ["Peptide", "NeurotransmitterInhibitor"], None),
    ("Leuphasyl", "PENTAPEPTIDE-18", "64963-01-5", "Peptide", 80, 280, ["Peptide", "NeurotransmitterInhibitor"], None),
    ("Palmitoyl Tripeptide-1", "PALMITOYL TRIPEPTIDE-1", "147732-56-7", "Peptide", 100, 350, ["Peptide", "SignalPeptide", "CollagenBooster"], None),
    ("Palmitoyl Tetrapeptide-7", "PALMITOYL TETRAPEPTIDE-7", "221227-05-0", "Peptide", 100, 350, ["Peptide", "SignalPeptide", "AntiInflammatory"], None),

    # --- Ceramides ---
    ("Ceramide NP", "CERAMIDE NP", "100403-19-8", "Ceramide", 60, 200, ["Ceramide", "Sphingolipid", "BarrierRepair"], None),
    ("Ceramide AP", "CERAMIDE AP", "100403-19-8", "Ceramide", 60, 200, ["Ceramide", "Sphingolipid", "BarrierRepair"], None),
    ("Phytosphingosine", "PHYTOSPHINGOSINE", "554-62-1", "Ceramide", 50, 180, ["Ceramide", "Sphingolipid", "AntiMicrobial"], None),
    ("Ceramide EOP", "CERAMIDE EOP", "100403-19-8", "Ceramide", 70, 220, ["Ceramide", "Sphingolipid", "BarrierRepair"], None),
    ("Cholesterol", "CHOLESTEROL", "57-88-5", "Ceramide", 15, 50, ["Ceramide", "Sterol", "BarrierRepair"], None),

    # --- Fragrance Components ---
    ("Linalool", "LINALOOL", "78-70-6", "FragranceComponent", 5, 15, ["FragranceComponent", "Terpene", "Allergen"], {"EU": 0.001}),
    ("Limonene", "LIMONENE", "5989-27-5", "FragranceComponent", 4, 12, ["FragranceComponent", "Terpene", "Allergen"], {"EU": 0.001}),
    ("Geraniol", "GERANIOL", "106-24-1", "FragranceComponent", 5, 15, ["FragranceComponent", "Terpene", "Allergen"], {"EU": 0.001}),
    ("Citronellol", "CITRONELLOL", "106-22-9", "FragranceComponent", 5, 15, ["FragranceComponent", "Terpene", "Allergen"], {"EU": 0.001}),
    ("Benzyl Alcohol", "BENZYL ALCOHOL", "100-51-6", "FragranceComponent", 4, 12, ["FragranceComponent", "AromaticAlcohol", "Preservative", "Allergen"], {"EU": 0.01}),
    ("Eugenol", "EUGENOL", "97-53-0", "FragranceComponent", 4, 12, ["FragranceComponent", "Phenol", "Allergen"], {"EU": 0.001}),
    ("Coumarin", "COUMARIN", "91-64-5", "FragranceComponent", 5, 15, ["FragranceComponent", "Lactone", "Allergen"], {"EU": 0.001}),
    ("Farnesol", "FARNESOL", "4602-84-0", "FragranceComponent", 6, 18, ["FragranceComponent", "Sesquiterpene", "Allergen"], {"EU": 0.001}),

    # --- Extra ingredients to reach 150+ ---
    # More Humectants
    ("Allantoin", "ALLANTOIN", "97-59-6", "Humectant", 5, 15, ["Humectant", "Soothing", "WoundHealingAgent"], None),
    ("Sorbitol", "SORBITOL", "50-70-4", "Humectant", 2, 8, ["Humectant", "Polyol"], None),

    # More Emollients
    ("Marula Oil", "SCLEROCARYA BIRREA SEED OIL", "1286498-48-5", "Emollient", 20, 55, ["Emollient", "PlantOil"], None),
    ("Hemp Seed Oil", "CANNABIS SATIVA SEED OIL", "68956-68-3", "Emollient", 8, 25, ["Emollient", "PlantOil"], None),
    ("Meadowfoam Seed Oil", "LIMNANTHES ALBA SEED OIL", "153065-40-8", "Emollient", 12, 35, ["Emollient", "PlantOil", "WaxEster"], None),
    ("Baobab Oil", "ADANSONIA DIGITATA SEED OIL", "225234-20-8", "Emollient", 15, 45, ["Emollient", "PlantOil"], None),
    ("Camellia Oil", "CAMELLIA JAPONICA SEED OIL", "225233-97-6", "Emollient", 12, 38, ["Emollient", "PlantOil"], None),

    # More Antioxidants
    ("Pycnogenol", "PINUS PINASTER BARK EXTRACT", "90082-75-0", "Antioxidant", 50, 180, ["Antioxidant", "Polyphenol", "PlantExtract"], None),
    ("Idebenone", "IDEBENONE", "58186-27-9", "Antioxidant", 80, 250, ["Antioxidant", "Quinone"], None),

    # More Peptides
    ("Palmitoyl Hexapeptide-12", "PALMITOYL HEXAPEPTIDE-12", "171263-26-6", "Peptide", 90, 320, ["Peptide", "SignalPeptide"], None),
    ("Tripeptide-29", "TRIPEPTIDE-29", "N/A-T29", "Peptide", 100, 350, ["Peptide", "SignalPeptide", "CollagenBooster"], None),

    # More Plant Extracts
    ("Saffron Extract", "CROCUS SATIVUS FLOWER EXTRACT", "84604-17-1", "PlantExtract", 30, 90, ["PlantExtract", "Antioxidant", "SkinBrightener"], None),
    ("Moringa Oil", "MORINGA OLEIFERA SEED OIL", "93165-54-9", "PlantExtract", 15, 45, ["PlantExtract", "Emollient", "Antioxidant"], None),
    ("Tamanu Oil", "CALOPHYLLUM INOPHYLLUM SEED OIL", "91771-47-0", "PlantExtract", 12, 40, ["PlantExtract", "Emollient", "WoundHealingAgent"], None),
    ("Arnica Extract", "ARNICA MONTANA FLOWER EXTRACT", "68990-11-4", "PlantExtract", 10, 30, ["PlantExtract", "AntiInflammatory"], None),
    ("Rosemary Extract", "ROSMARINUS OFFICINALIS LEAF EXTRACT", "84604-14-8", "PlantExtract", 6, 20, ["PlantExtract", "Antioxidant"], None),
    ("Lavender Extract", "LAVANDULA ANGUSTIFOLIA EXTRACT", "84776-65-8", "PlantExtract", 8, 25, ["PlantExtract", "Soothing"], None),
    ("Echinacea Extract", "ECHINACEA PURPUREA EXTRACT", "90028-20-9", "PlantExtract", 10, 30, ["PlantExtract", "AntiInflammatory"], None),

    # Water (base of every formulation)
    ("Water", "AQUA", "7732-18-5", "Humectant", 0, 1, ["Solvent", "Base"], None),

    # Extra UV Filters
    ("Homosalate", "HOMOSALATE", "118-56-9", "UVFilter", 6, 18, ["UVFilter", "ChemicalFilter"], {"EU": 0.10, "US": 0.15}),
    ("Ensulizole", "PHENYLBENZIMIDAZOLE SULFONIC ACID", "27503-81-7", "UVFilter", 8, 22, ["UVFilter", "ChemicalFilter", "WaterSoluble"], {"EU": 0.08}),

    # Extra Preservatives
    ("Methylparaben", "METHYLPARABEN", "99-76-3", "Preservative", 2, 8, ["Preservative", "Paraben"], {"EU": 0.004}),
    ("Propylparaben", "PROPYLPARABEN", "94-13-3", "Preservative", 2, 8, ["Preservative", "Paraben"], {"EU": 0.004}),
    ("Chlorphenesin", "CHLORPHENESIN", "104-29-0", "Preservative", 3, 10, ["Preservative", "Antimicrobial"], {"EU": 0.003}),

    # Extra surfactants
    ("Stearic Acid", "STEARIC ACID", "57-11-4", "Surfactant", 2, 8, ["Surfactant", "FattyAcid", "Emulsifier"], None),
    ("Ceteareth-20", "CETEARETH-20", "68439-49-6", "Surfactant", 4, 14, ["Surfactant", "NonionicSurfactant", "Emulsifier"], None),

    # More VitaminDerivatives
    ("Retinyl Ascorbate", "RETINYL ASCORBATE", "N/A-RA", "VitaminDerivative", 60, 180, ["VitaminDerivative", "VitaminADerivative", "VitaminCDerivative"], None),
    ("Menadione", "MENADIONE", "58-27-5", "VitaminDerivative", 20, 60, ["VitaminDerivative", "VitaminKDerivative"], None),

    # More Thickeners
    ("Hyaluronic Acid Crosspolymer", "SODIUM HYALURONATE CROSSPOLYMER", "N/A-HAC", "Thickener", 80, 200, ["Thickener", "Biopolymer", "Humectant"], None),
    ("Sclerotium Gum", "SCLEROTIUM GUM", "39464-87-4", "Thickener", 10, 30, ["Thickener", "Polysaccharide", "RheologyModifier"], None),

    # Extra Ceramides
    ("Sphingomyelin", "SPHINGOMYELIN", "85187-10-6", "Ceramide", 50, 180, ["Ceramide", "Phospholipid", "BarrierRepair"], None),

    # More Humectants
    ("Pentylene Glycol", "PENTYLENE GLYCOL", "5343-92-0", "Humectant", 5, 15, ["Humectant", "Polyol", "Antimicrobial"], None),
    ("Saccharide Isomerate", "SACCHARIDE ISOMERATE", "N/A-SI", "Humectant", 15, 45, ["Humectant", "Saccharide"], None),
    ("Erythritol", "ERYTHRITOL", "149-32-6", "Humectant", 4, 12, ["Humectant", "Polyol"], None),

    # More Emollients
    ("Crambe Abyssinica Oil", "CRAMBE ABYSSINICA SEED OIL", "N/A-CAO", "Emollient", 10, 30, ["Emollient", "PlantOil", "WaxEster"], None),
    ("Grape Seed Oil", "VITIS VINIFERA SEED OIL", "85594-37-2", "Emollient", 5, 18, ["Emollient", "PlantOil"], None),

    # More Fragrance
    ("Cinnamal", "CINNAMAL", "104-55-2", "FragranceComponent", 4, 12, ["FragranceComponent", "Aldehyde", "Allergen"], {"EU": 0.001}),
    ("Benzyl Benzoate", "BENZYL BENZOATE", "120-51-4", "FragranceComponent", 4, 12, ["FragranceComponent", "Ester", "Allergen"], {"EU": 0.001}),
]

# ---------------------------------------------------------------------------
# 3. SUPPLIERS
# ---------------------------------------------------------------------------
SUPPLIERS = [
    ("BASF Care Chemicals", "Germany"),
    ("Ashland Specialty Ingredients", "USA"),
    ("Evonik Nutrition & Care", "Germany"),
    ("Croda International", "UK"),
    ("DSM-Firmenich", "Switzerland"),
    ("Seppic", "France"),
    ("Lonza Personal Care", "Switzerland"),
    ("Givaudan Active Beauty", "Switzerland"),
    ("Symrise", "Germany"),
    ("Lubrizol Advanced Materials", "USA"),
    ("Gattefosse", "France"),
    ("Clariant Active Ingredients", "Switzerland"),
    ("IFF Lucas Meyer Cosmetics", "France"),
    ("Bioland", "South Korea"),
    ("Nikkol Group", "Japan"),
]

# ---------------------------------------------------------------------------
# 4. MARKETS
# ---------------------------------------------------------------------------
MARKETS = [
    ("EU", "EC_1223_2009"),
    ("US", "FDA_21CFR"),
    ("China", "NMPA_2015"),
    ("Japan", "MHLW_Standards"),
    ("South Korea", "MFDS_Standards"),
]

# ---------------------------------------------------------------------------
# 5. BRANDS & PRODUCT LINES
# ---------------------------------------------------------------------------
BRANDS = [
    "Lumière Naturelle",
    "DermaVeil",
    "Aethon Labs",
]

PRODUCT_LINES = [
    ("Anti-Aging Essential", "Lumière Naturelle"),
    ("Hydra-Glow", "Lumière Naturelle"),
    ("Clear Skin Pro", "DermaVeil"),
    ("Sun Shield", "DermaVeil"),
    ("BioActive Complex", "Aethon Labs"),
    ("Retinoid Precision", "Aethon Labs"),
    ("Sensitive Calm", "Lumière Naturelle"),
    ("Radiance Boost", "DermaVeil"),
]

# ---------------------------------------------------------------------------
# 6. INCOMPATIBILITY and COMPATIBILITY data
# ---------------------------------------------------------------------------
INCOMPATIBILITIES = [
    ("Retinol", "Glycolic Acid"),
    ("Retinol", "Salicylic Acid"),
    ("Retinol", "Ascorbic Acid"),
    ("Retinol", "Lactic Acid"),
    ("Retinal", "Glycolic Acid"),
    ("Retinal", "Ascorbic Acid"),
    ("Retinal", "Salicylic Acid"),
    ("Ascorbic Acid", "Niacinamide"),
    ("Glycolic Acid", "Niacinamide"),
    ("Salicylic Acid", "Glycolic Acid"),
    ("Sodium Lauryl Sulfate", "Ceramide NP"),
    ("Sodium Lauryl Sulfate", "Ceramide AP"),
    ("Avobenzone", "Zinc Oxide"),
    ("Retinol", "Avobenzone"),
    ("Methylparaben", "Propylparaben"),  # combined limit
]

COMPATIBILITIES = [
    ("Hyaluronic Acid", "Niacinamide"),
    ("Retinol", "Tocopherol"),
    ("Ascorbic Acid", "Ferulic Acid"),
    ("Ascorbic Acid", "Tocopherol"),
    ("Niacinamide", "Hyaluronic Acid"),
    ("Ceramide NP", "Cholesterol"),
    ("Ceramide NP", "Phytosphingosine"),
    ("Ceramide AP", "Cholesterol"),
    ("Glycerin", "Hyaluronic Acid"),
    ("Bakuchiol", "Niacinamide"),
    ("Zinc Oxide", "Titanium Dioxide"),
    ("Matrixyl", "Argireline"),
    ("Ferulic Acid", "Tocopherol"),
    ("Centella Asiatica", "Niacinamide"),
    ("Squalane", "Ceramide NP"),
]

SUBSTITUTES = [
    ("Bakuchiol", "Retinol"),
    ("Moth Bean Extract", "Retinol"),
    ("Rambutan Extract", "Retinol"),
    ("Mandelic Acid", "Glycolic Acid"),
    ("Lactic Acid", "Glycolic Acid"),
    ("Betaine Salicylate", "Salicylic Acid"),
    ("Ascorbyl Glucoside", "Ascorbic Acid"),
    ("Sodium Ascorbyl Phosphate", "Ascorbic Acid"),
    ("Titanium Dioxide", "Zinc Oxide"),
]

# ---------------------------------------------------------------------------
# 7. PRODUCT TEMPLATES
# ---------------------------------------------------------------------------

def make_var(name):
    """Make a Cypher variable name from an ingredient/node name."""
    return "n_" + "".join(c if c.isalnum() else "_" for c in name).lower().rstrip("_")

def pick(lst):
    return random.choice(lst)

def pick_n(lst, n):
    return random.sample(lst, min(n, len(lst)))

# Ingredient lookup by name
ING_BY_NAME = {i[0]: i for i in INGREDIENTS}
ING_BY_CAT = {}
for i in INGREDIENTS:
    ING_BY_CAT.setdefault(i[3], []).append(i)

# Product templates define the BOM structure
# Each product has phases, each phase has slots with category + ratio range
PRODUCT_TEMPLATES = {
    "Anti-Aging Serum": {
        "type": "Serum",
        "phases": {
            "Water Phase": {"ratio": (0.60, 0.70), "slots": [
                ("Humectant", "Water", (0.85, 0.92)),
                ("Humectant", None, (0.03, 0.06)),
                ("VitaminDerivative", None, (0.01, 0.03)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Oil Phase": {"ratio": (0.20, 0.28), "slots": [
                ("Emollient", None, (0.70, 0.85)),
                ("Thickener", None, (0.05, 0.10)),
            ], "premixes": {
                "Active Oil Blend": {"ratio": (0.10, 0.20), "slots": [
                    ("RetinoidAgent", None, (0.02, 0.05)),
                    ("Emollient", None, (0.95, 0.98)),
                ]}
            }},
            "Active Phase": {"ratio": (0.05, 0.10), "slots": [
                ("Antioxidant", None, (0.30, 0.50)),
                ("Peptide", None, (0.50, 0.70)),
            ]},
        }
    },
    "Hydrating Cream": {
        "type": "Cream",
        "phases": {
            "Water Phase": {"ratio": (0.55, 0.65), "slots": [
                ("Humectant", "Water", (0.80, 0.90)),
                ("Humectant", None, (0.04, 0.08)),
                ("Humectant", None, (0.02, 0.04)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Oil Phase": {"ratio": (0.25, 0.35), "slots": [
                ("Emollient", None, (0.60, 0.75)),
                ("Emollient", None, (0.10, 0.20)),
                ("Surfactant", None, (0.05, 0.10)),
                ("Thickener", None, (0.05, 0.10)),
            ]},
            "Active Phase": {"ratio": (0.05, 0.10), "slots": [
                ("Ceramide", None, (0.30, 0.50)),
                ("VitaminDerivative", None, (0.30, 0.50)),
                ("PlantExtract", None, (0.10, 0.30)),
            ]},
        }
    },
    "Exfoliating Peel": {
        "type": "Peel",
        "phases": {
            "Aqueous Phase": {"ratio": (0.70, 0.80), "slots": [
                ("Humectant", "Water", (0.75, 0.85)),
                ("AHAExfoliant", None, (0.05, 0.10)),
                ("Humectant", None, (0.03, 0.06)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Active Phase": {"ratio": (0.15, 0.25), "slots": [
                ("AHAExfoliant", None, (0.40, 0.60)),
                ("BHAExfoliant", None, (0.15, 0.30)),
                ("Antioxidant", None, (0.15, 0.30)),
            ]},
            "Soothing Phase": {"ratio": (0.05, 0.08), "slots": [
                ("PlantExtract", None, (0.50, 0.70)),
                ("Humectant", None, (0.30, 0.50)),
            ]},
        }
    },
    "Sunscreen": {
        "type": "Sunscreen",
        "phases": {
            "Water Phase": {"ratio": (0.50, 0.60), "slots": [
                ("Humectant", "Water", (0.80, 0.90)),
                ("Humectant", None, (0.04, 0.08)),
                ("Preservative", None, (0.005, 0.01)),
                ("Thickener", None, (0.02, 0.05)),
            ]},
            "UV Phase": {"ratio": (0.25, 0.35), "slots": [
                ("UVFilter", None, (0.40, 0.55)),
                ("UVFilter", None, (0.20, 0.35)),
                ("Emollient", None, (0.15, 0.25)),
            ]},
            "Care Phase": {"ratio": (0.05, 0.10), "slots": [
                ("Antioxidant", None, (0.40, 0.60)),
                ("VitaminDerivative", None, (0.30, 0.50)),
            ]},
        }
    },
    "Vitamin C Serum": {
        "type": "Serum",
        "phases": {
            "Water Phase": {"ratio": (0.65, 0.75), "slots": [
                ("Humectant", "Water", (0.80, 0.88)),
                ("Humectant", None, (0.04, 0.08)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Active Phase": {"ratio": (0.15, 0.25), "slots": [
                ("Antioxidant", "Ascorbic Acid", (0.40, 0.60)),
                ("Antioxidant", "Ferulic Acid", (0.15, 0.25)),
                ("Antioxidant", "Tocopherol", (0.15, 0.25)),
            ]},
            "Oil Phase": {"ratio": (0.05, 0.10), "slots": [
                ("Emollient", None, (0.70, 0.85)),
                ("Thickener", None, (0.15, 0.30)),
            ]},
        }
    },
    "Barrier Repair Cream": {
        "type": "Cream",
        "phases": {
            "Water Phase": {"ratio": (0.55, 0.65), "slots": [
                ("Humectant", "Water", (0.82, 0.90)),
                ("Humectant", None, (0.04, 0.07)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Lipid Phase": {"ratio": (0.25, 0.35), "slots": [
                ("Emollient", None, (0.50, 0.65)),
                ("Ceramide", None, (0.15, 0.25)),
                ("Ceramide", None, (0.08, 0.15)),
                ("Surfactant", None, (0.05, 0.10)),
            ]},
            "Active Phase": {"ratio": (0.05, 0.10), "slots": [
                ("PlantExtract", None, (0.40, 0.60)),
                ("VitaminDerivative", None, (0.30, 0.50)),
            ]},
        }
    },
    "Retinol Night Cream": {
        "type": "Cream",
        "phases": {
            "Water Phase": {"ratio": (0.55, 0.65), "slots": [
                ("Humectant", "Water", (0.82, 0.90)),
                ("Humectant", None, (0.03, 0.06)),
                ("VitaminDerivative", None, (0.02, 0.04)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Oil Phase": {"ratio": (0.25, 0.35), "slots": [
                ("Emollient", None, (0.65, 0.80)),
                ("Thickener", None, (0.05, 0.10)),
            ], "premixes": {
                "Retinoid Blend": {"ratio": (0.10, 0.20), "slots": [
                    ("RetinoidAgent", None, (0.02, 0.05)),
                    ("Emollient", None, (0.95, 0.98)),
                ]}
            }},
            "Active Phase": {"ratio": (0.05, 0.10), "slots": [
                ("Antioxidant", None, (0.40, 0.55)),
                ("Peptide", None, (0.35, 0.50)),
            ]},
        }
    },
    "Niacinamide Serum": {
        "type": "Serum",
        "phases": {
            "Water Phase": {"ratio": (0.70, 0.78), "slots": [
                ("Humectant", "Water", (0.80, 0.88)),
                ("VitaminDerivative", "Niacinamide", (0.05, 0.10)),
                ("Humectant", None, (0.03, 0.05)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Oil Phase": {"ratio": (0.10, 0.18), "slots": [
                ("Emollient", None, (0.70, 0.85)),
                ("Thickener", None, (0.15, 0.30)),
            ]},
            "Active Phase": {"ratio": (0.05, 0.10), "slots": [
                ("PlantExtract", None, (0.40, 0.60)),
                ("Antioxidant", None, (0.30, 0.50)),
            ]},
        }
    },
    "Peptide Eye Cream": {
        "type": "Cream",
        "phases": {
            "Water Phase": {"ratio": (0.60, 0.68), "slots": [
                ("Humectant", "Water", (0.82, 0.90)),
                ("Humectant", None, (0.04, 0.07)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Oil Phase": {"ratio": (0.20, 0.28), "slots": [
                ("Emollient", None, (0.65, 0.80)),
                ("Ceramide", None, (0.10, 0.20)),
                ("Thickener", None, (0.05, 0.10)),
            ]},
            "Peptide Phase": {"ratio": (0.08, 0.12), "slots": [
                ("Peptide", None, (0.30, 0.45)),
                ("Peptide", None, (0.25, 0.40)),
                ("Antioxidant", None, (0.15, 0.30)),
            ]},
        }
    },
    "Gentle Cleanser": {
        "type": "Cleanser",
        "phases": {
            "Aqueous Phase": {"ratio": (0.70, 0.80), "slots": [
                ("Humectant", "Water", (0.80, 0.90)),
                ("Humectant", None, (0.04, 0.08)),
                ("Preservative", None, (0.005, 0.01)),
            ]},
            "Cleansing Phase": {"ratio": (0.15, 0.25), "slots": [
                ("Surfactant", None, (0.50, 0.65)),
                ("Surfactant", None, (0.20, 0.35)),
                ("Humectant", None, (0.10, 0.20)),
            ]},
            "Soothing Phase": {"ratio": (0.03, 0.06), "slots": [
                ("PlantExtract", None, (0.50, 0.70)),
                ("VitaminDerivative", None, (0.30, 0.50)),
            ]},
        }
    },
}


def normalize_ratios(values):
    """Normalize a list of floats so they sum to 1.0."""
    total = sum(values)
    if total == 0:
        return [1.0 / len(values)] * len(values)
    return [v / total for v in values]


def generate_products():
    """Generate product definitions with BOM trees."""
    products = []
    template_names = list(PRODUCT_TEMPLATES.keys())
    product_count = 0

    # Generate 3-5 products per template to reach 30-50
    for tmpl_name in template_names:
        tmpl = PRODUCT_TEMPLATES[tmpl_name]
        n_variants = random.randint(3, 5)
        for vi in range(n_variants):
            product_count += 1
            prod_line = pick(PRODUCT_LINES)
            suffix = f"V{vi+1}"
            pname = f"{tmpl_name} {suffix}"
            sku = f"SKU-{product_count:04d}"
            markets = pick_n(MARKETS, random.randint(1, 4))
            brand = prod_line[1]
            line = prod_line[0]

            # Generate BOM
            bom = generate_bom(tmpl)

            products.append({
                "name": pname,
                "sku": sku,
                "type": tmpl["type"],
                "brand": brand,
                "line": line,
                "markets": markets,
                "bom": bom,
            })

            if product_count >= 40:
                break
        if product_count >= 40:
            break

    return products


def generate_bom(tmpl):
    """Generate a BOM tree from a product template."""
    phases_def = tmpl["phases"]
    phase_names = list(phases_def.keys())

    # Generate phase ratios
    raw_ratios = []
    for pn in phase_names:
        pdef = phases_def[pn]
        r = random.uniform(*pdef["ratio"])
        raw_ratios.append(r)
    phase_ratios = normalize_ratios(raw_ratios)

    bom = []
    used_ingredients = set()

    for pi, pn in enumerate(phase_names):
        pdef = phases_def[pn]
        phase_ratio = round(phase_ratios[pi], 6)

        phase_children = []

        # Regular slots
        slots = pdef["slots"]
        premixes = pdef.get("premixes", {})

        # Compute slot ratios + premix ratios
        all_items = []  # (type, data, raw_ratio)
        for cat, fixed_name, ratio_range in slots:
            r = random.uniform(*ratio_range)
            all_items.append(("ingredient", (cat, fixed_name), r))
        for pm_name, pm_def in premixes.items():
            r = random.uniform(*pm_def["ratio"])
            all_items.append(("premix", (pm_name, pm_def), r))

        raw = [x[2] for x in all_items]
        normed = normalize_ratios(raw)

        for idx, (item_type, item_data, _) in enumerate(all_items):
            ratio = round(normed[idx], 6)
            if item_type == "ingredient":
                cat, fixed_name = item_data
                ing = pick_ingredient(cat, fixed_name, used_ingredients)
                if ing:
                    used_ingredients.add(ing[0])
                    phase_children.append({"type": "ingredient", "ingredient": ing[0], "ratio": ratio})
            else:
                pm_name, pm_def = item_data
                pm_slots = pm_def["slots"]
                pm_raw = [random.uniform(*s[2]) for s in pm_slots]
                pm_normed = normalize_ratios(pm_raw)
                pm_children = []
                for si, (cat, fixed_name, _) in enumerate(pm_slots):
                    pm_ratio = round(pm_normed[si], 6)
                    ing = pick_ingredient(cat, fixed_name, used_ingredients)
                    if ing:
                        used_ingredients.add(ing[0])
                        pm_children.append({"type": "ingredient", "ingredient": ing[0], "ratio": pm_ratio})
                phase_children.append({"type": "premix", "name": pm_name, "ratio": ratio, "children": pm_children})

        bom.append({"phase": pn, "ratio": phase_ratio, "children": phase_children})

    return bom


def pick_ingredient(category, fixed_name, used):
    """Pick an ingredient from a category, avoiding duplicates."""
    if fixed_name:
        ing = ING_BY_NAME.get(fixed_name)
        if ing:
            return ing
    candidates = [i for i in ING_BY_CAT.get(category, []) if i[0] not in used]
    if not candidates:
        candidates = ING_BY_CAT.get(category, [])
    if not candidates:
        return None
    return pick(candidates)


# ---------------------------------------------------------------------------
# 8. CYPHER GENERATION
# ---------------------------------------------------------------------------

def escape_cypher_string(s):
    """Escape a string for use inside single-quoted Cypher strings."""
    return s.replace("\\", "\\\\").replace("'", "\\'")


def generate_turtle(ing):
    """Generate Turtle RDF payload for an ingredient."""
    name, inci, cas, cat, _, _, rdf_classes, reg = ing
    safe_name = "".join(c if c.isalnum() else "" for c in name)
    lines = []
    lines.append('@prefix cosmo: <http://example.org/cosmo#> .')
    lines.append('@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .')
    lines.append('@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .')
    class_decls = ", ".join(f"cosmo:{c}" for c in rdf_classes)
    lines.append(f'cosmo:{safe_name} a {class_decls} ;')
    lines.append(f'    rdfs:label "{name}" ;')
    lines.append(f'    cosmo:inciName "{inci}" ;')
    lines.append(f'    cosmo:casNumber "{cas}" .')
    if reg:
        # Remove the trailing period and add regulation triples
        lines[-1] = lines[-1][:-1] + ";"
        reg_items = list(reg.items())
        for ri, (market, limit) in enumerate(reg_items):
            end = " ." if ri == len(reg_items) - 1 else " ;"
            lines.append(f'    cosmo:maxConcentration{market} "{limit}"^^xsd:double{end}')
    return "\\n".join(lines)


def emit_cypher(products):
    """Generate the full .cypher file content."""
    out = []

    # -- Step 0: Clean --
    out.append("// ============================================================")
    out.append("// Step 0: Clean database")
    out.append("// ============================================================")
    out.append("MATCH (n) DETACH DELETE n;")
    out.append("")

    # -- Categories --
    out.append("// ============================================================")
    out.append("// Step 1: Create Categories")
    out.append("// ============================================================")
    for cat in CATEGORIES:
        out.append(f"CREATE (:{cat_label(cat)} {{name: '{cat}'}});")
    out.append("")

    # -- Suppliers --
    out.append("// ============================================================")
    out.append("// Step 2: Create Suppliers")
    out.append("// ============================================================")
    for sname, country in SUPPLIERS:
        out.append(f"CREATE (:Supplier {{name: '{escape_cypher_string(sname)}', country: '{country}'}});")
    out.append("")

    # -- Markets --
    out.append("// ============================================================")
    out.append("// Step 3: Create Markets")
    out.append("// ============================================================")
    for mname, reg in MARKETS:
        out.append(f"CREATE (:Market {{name: '{mname}', regulation: '{reg}'}});")
    out.append("")

    # -- Brands --
    out.append("// ============================================================")
    out.append("// Step 4: Create Brands and Product Lines")
    out.append("// ============================================================")
    for brand in BRANDS:
        out.append(f"CREATE (:Brand {{name: '{escape_cypher_string(brand)}'}});")
    for line, brand in PRODUCT_LINES:
        out.append(f"MATCH (b:Brand {{name: '{escape_cypher_string(brand)}'}}) CREATE (pl:ProductLine {{name: '{escape_cypher_string(line)}'}})-[:OWNED_BY]->(b);")
    out.append("")

    # -- Ingredients --
    out.append("// ============================================================")
    out.append("// Step 5: Create Ingredients")
    out.append("// ============================================================")
    for ing in INGREDIENTS:
        name, inci, cas, cat, cost_low, cost_high, rdf_classes, reg = ing
        cost = round(random.uniform(cost_low, cost_high), 2)
        turtle = generate_turtle(ing)
        out.append(
            f"CREATE (:Ingredient {{name: '{escape_cypher_string(name)}', "
            f"inci: '{escape_cypher_string(inci)}', "
            f"cas: '{escape_cypher_string(cas)}', "
            f"cost: {cost}, "
            f"turtle: '{turtle}'}});"
        )
    out.append("")

    # -- Ingredient -> Category relationships --
    out.append("// ============================================================")
    out.append("// Step 6: Ingredient BELONGS_TO Category")
    out.append("// ============================================================")
    for ing in INGREDIENTS:
        name, _, _, cat, _, _, _, _ = ing
        out.append(
            f"MATCH (i:Ingredient {{name: '{escape_cypher_string(name)}'}}), "
            f"(c:Category {{name: '{cat}'}}) "
            f"CREATE (i)-[:BELONGS_TO]->(c);"
        )
    out.append("")

    # -- Ingredient -> Supplier relationships --
    out.append("// ============================================================")
    out.append("// Step 7: Ingredient SUPPLIED_BY Supplier")
    out.append("// ============================================================")
    for ing in INGREDIENTS:
        name = ing[0]
        supplier = pick(SUPPLIERS)
        out.append(
            f"MATCH (i:Ingredient {{name: '{escape_cypher_string(name)}'}}), "
            f"(s:Supplier {{name: '{escape_cypher_string(supplier[0])}'}}) "
            f"CREATE (i)-[:SUPPLIED_BY]->(s);"
        )
    out.append("")

    # -- Incompatibilities --
    out.append("// ============================================================")
    out.append("// Step 8: INCOMPATIBLE_WITH relationships")
    out.append("// ============================================================")
    for a, b in INCOMPATIBILITIES:
        out.append(
            f"MATCH (a:Ingredient {{name: '{escape_cypher_string(a)}'}}), "
            f"(b:Ingredient {{name: '{escape_cypher_string(b)}'}}) "
            f"CREATE (a)-[:INCOMPATIBLE_WITH]->(b), (b)-[:INCOMPATIBLE_WITH]->(a);"
        )
    out.append("")

    # -- Compatibilities --
    out.append("// ============================================================")
    out.append("// Step 9: COMPATIBLE_WITH relationships")
    out.append("// ============================================================")
    for a, b in COMPATIBILITIES:
        out.append(
            f"MATCH (a:Ingredient {{name: '{escape_cypher_string(a)}'}}), "
            f"(b:Ingredient {{name: '{escape_cypher_string(b)}'}}) "
            f"CREATE (a)-[:COMPATIBLE_WITH]->(b);"
        )
    out.append("")

    # -- Substitutes --
    out.append("// ============================================================")
    out.append("// Step 10: SUBSTITUTE_FOR relationships")
    out.append("// ============================================================")
    for a, b in SUBSTITUTES:
        out.append(
            f"MATCH (a:Ingredient {{name: '{escape_cypher_string(a)}'}}), "
            f"(b:Ingredient {{name: '{escape_cypher_string(b)}'}}) "
            f"CREATE (a)-[:SUBSTITUTE_FOR]->(b);"
        )
    out.append("")

    # -- Products with BOMs --
    out.append("// ============================================================")
    out.append("// Step 11: Create Products with BOM trees")
    out.append("// ============================================================")
    for prod in products:
        pname = escape_cypher_string(prod["name"])
        sku = prod["sku"]
        ptype = prod["type"]
        brand = escape_cypher_string(prod["brand"])
        line = escape_cypher_string(prod["line"])

        out.append(f"// --- Product: {prod['name']} ---")
        out.append(f"CREATE (:Product {{name: '{pname}', sku: '{sku}', type: '{ptype}'}});")

        # Link to brand
        out.append(
            f"MATCH (p:Product {{sku: '{sku}'}}), (b:Brand {{name: '{brand}'}}) "
            f"CREATE (p)-[:PRODUCED_BY]->(b);"
        )
        # Link to product line
        out.append(
            f"MATCH (p:Product {{sku: '{sku}'}}), (pl:ProductLine {{name: '{line}'}}) "
            f"CREATE (p)-[:IN_LINE]->(pl);"
        )
        # Link to markets
        for mkt in prod["markets"]:
            out.append(
                f"MATCH (p:Product {{sku: '{sku}'}}), (m:Market {{name: '{mkt[0]}'}}) "
                f"CREATE (p)-[:SOLD_IN]->(m);"
            )

        # BOM tree
        for phase in prod["bom"]:
            phase_name = escape_cypher_string(phase["phase"])
            phase_var = f"{sku}_{make_var(phase['phase'])}"
            out.append(
                f"CREATE (:{phase_label()} {{name: '{phase_name}'}});"
            )
            out.append(
                f"MATCH (p:Product {{sku: '{sku}'}}), (ph:Phase) WHERE ph.name = '{phase_name}' "
                f"AND NOT EXISTS {{ MATCH (ph)<-[:CONTAINS]-() }} "
                f"CREATE (p)-[:CONTAINS {{ratio: {phase['ratio']}}}]->(ph);"
            )

            for child in phase["children"]:
                if child["type"] == "ingredient":
                    ing_name = escape_cypher_string(child["ingredient"])
                    out.append(
                        f"MATCH (ph:Phase {{name: '{phase_name}'}})<-[:CONTAINS]-({{sku: '{sku}'}}), "
                        f"(i:Ingredient {{name: '{ing_name}'}}) "
                        f"CREATE (ph)-[:CONTAINS {{ratio: {child['ratio']}}}]->(i);"
                    )
                elif child["type"] == "premix":
                    pm_name = escape_cypher_string(child["name"])
                    out.append(
                        f"CREATE (:PreMix {{name: '{pm_name}'}});"
                    )
                    out.append(
                        f"MATCH (ph:Phase {{name: '{phase_name}'}})<-[:CONTAINS]-({{sku: '{sku}'}}), "
                        f"(pm:PreMix {{name: '{pm_name}'}}) "
                        f"WHERE NOT EXISTS {{ MATCH (pm)<-[:CONTAINS]-() }} "
                        f"CREATE (ph)-[:CONTAINS {{ratio: {child['ratio']}}}]->(pm);"
                    )
                    for pm_child in child["children"]:
                        pm_ing_name = escape_cypher_string(pm_child["ingredient"])
                        out.append(
                            f"MATCH (pm:PreMix {{name: '{pm_name}'}})<-[:CONTAINS]-(:Phase)<-[:CONTAINS]-({{sku: '{sku}'}}), "
                            f"(i:Ingredient {{name: '{pm_ing_name}'}}) "
                            f"CREATE (pm)-[:CONTAINS {{ratio: {pm_child['ratio']}}}]->(i);"
                        )

        out.append("")

    # -- Ontology node --
    out.append("// ============================================================")
    out.append("// Step 12: Create Ontology and SHACL nodes")
    out.append("// ============================================================")
    ontology_turtle = generate_ontology_turtle()
    shacl_turtle = generate_shacl_turtle()
    out.append(
        f"CREATE (:Ontology {{name: 'cosmo', turtle: '{ontology_turtle}'}});"
    )
    out.append(
        f"CREATE (:SHACLRules {{name: 'cosmo_validation', turtle: '{shacl_turtle}'}});"
    )
    out.append("")

    return "\n".join(out)


def cat_label(cat):
    """Return the label string for a category node."""
    return "Category"


def phase_label():
    return "Phase"


def generate_ontology_turtle():
    """Generate the cosmo ontology as Turtle."""
    lines = []
    lines.append("@prefix cosmo: <http://example.org/cosmo#> .")
    lines.append("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")
    lines.append("@prefix owl: <http://www.w3.org/2002/07/owl#> .")
    lines.append("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .")
    lines.append("")
    lines.append("# Class hierarchy")
    lines.append("cosmo:CosmeticIngredient a owl:Class .")
    lines.append("")

    # All category classes as subclasses of CosmeticIngredient
    all_classes = set()
    for ing in INGREDIENTS:
        for cls in ing[6]:
            all_classes.add(cls)

    top_classes = set(CATEGORIES)
    for cls in sorted(all_classes):
        if cls in top_classes:
            lines.append(f"cosmo:{cls} a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
        elif cls not in ("Solvent", "Base"):
            # Find which top class this is related to (heuristic)
            lines.append(f"cosmo:{cls} a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")

    lines.append("")
    lines.append("# Properties")
    lines.append("cosmo:maxConcentrationEU a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:double .")
    lines.append("cosmo:maxConcentrationUS a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:double .")
    lines.append("cosmo:maxConcentrationChina a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:double .")
    lines.append("cosmo:maxConcentrationJapan a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:double .")
    lines.append("cosmo:inciName a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:string .")
    lines.append("cosmo:casNumber a owl:DatatypeProperty ; rdfs:domain cosmo:CosmeticIngredient ; rdfs:range xsd:string .")
    lines.append("")
    lines.append("# Key axioms for reasoning")
    lines.append("cosmo:PhotosensitiveAgent a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("cosmo:IrritantRisk a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("cosmo:Allergen a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("cosmo:pHSensitiveAgent a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("cosmo:Keratolytic a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("")
    lines.append("# Regulatory classification rules")
    lines.append("cosmo:RegulatedIngredient a owl:Class ; rdfs:subClassOf cosmo:CosmeticIngredient .")
    lines.append("cosmo:StrictlyRegulatedIngredient a owl:Class ; rdfs:subClassOf cosmo:RegulatedIngredient .")

    return "\\n".join(lines)


def generate_shacl_turtle():
    """Generate SHACL shapes for regulatory validation."""
    lines = []
    lines.append("@prefix sh: <http://www.w3.org/ns/shacl#> .")
    lines.append("@prefix cosmo: <http://example.org/cosmo#> .")
    lines.append("@prefix xsd: <http://www.w3.org/2001/XMLSchema#> .")
    lines.append("@prefix rdfs: <http://www.w3.org/2000/01/rdf-schema#> .")
    lines.append("")

    # EU market shapes
    lines.append("# EU Regulatory Shapes")
    lines.append("cosmo:EURetinoidShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:RetinoidAgent ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationEU ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:datatype xsd:double ;')
    lines.append('        sh:message "EU: Retinoid concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")
    lines.append("cosmo:EUPreservativeShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:Preservative ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationEU ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:datatype xsd:double ;')
    lines.append('        sh:message "EU: Preservative concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")
    lines.append("cosmo:AllergenShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:Allergen ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationEU ;')
    lines.append('        sh:minCount 1 ;')
    lines.append('        sh:message "EU: Allergens must declare concentration limits" ;')
    lines.append('    ] .')
    lines.append("")

    # US market shapes
    lines.append("# US Regulatory Shapes")
    lines.append("cosmo:USUVFilterShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:UVFilter ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationUS ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "US: UV Filter concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")
    lines.append("cosmo:USPreservativeShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:Preservative ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationUS ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "US: Preservative concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")

    # China market shapes
    lines.append("# China Regulatory Shapes")
    lines.append("cosmo:ChinaRetinoidShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:RetinoidAgent ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationChina ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "China: Retinoid concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")
    lines.append("cosmo:ChinaExfoliantShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:AHAExfoliant ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationChina ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "China: AHA Exfoliant concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")

    # Japan market shapes
    lines.append("# Japan Regulatory Shapes")
    lines.append("cosmo:JapanRetinoidShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:RetinoidAgent ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationJapan ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "Japan: Retinoid concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")
    lines.append("cosmo:JapanPreservativeShape a sh:NodeShape ;")
    lines.append('    sh:targetClass cosmo:Preservative ;')
    lines.append('    sh:property [')
    lines.append('        sh:path cosmo:maxConcentrationJapan ;')
    lines.append('        sh:maxCount 1 ;')
    lines.append('        sh:message "Japan: Preservative concentration limit must be declared" ;')
    lines.append('    ] .')
    lines.append("")

    # SPARQL-based SHACL constraints for concentration validation — per market
    for market in ["EU", "US", "China", "Japan"]:
        lines.append(f"cosmo:{market}ConcentrationLimitShape a sh:NodeShape ;")
        lines.append('    sh:targetClass cosmo:CosmeticIngredient ;')
        lines.append('    sh:sparql [')
        lines.append('        a sh:SPARQLConstraint ;')
        lines.append(f'        sh:message "{market} concentration limit exceeded: {{?this}} has {{?actual}} but limit is {{?limit}}" ;')
        lines.append(f'        sh:select "PREFIX cosmo: <http://example.org/cosmo#> PREFIX xsd: <http://www.w3.org/2001/XMLSchema#> SELECT $this ?actual ?limit WHERE {{ $this cosmo:actualConcentration ?actual . $this cosmo:maxConcentration{market} ?limit . FILTER(xsd:double(?actual) > xsd:double(?limit)) }}" ;')
        lines.append('    ] .')
        lines.append("")

    return "\\n".join(lines)


# ---------------------------------------------------------------------------
# MAIN
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    products = generate_products()
    cypher = emit_cypher(products)

    outpath = "data/load_data.cypher"
    import os
    os.makedirs("data", exist_ok=True)
    with open(outpath, "w") as f:
        f.write(cypher)

    print(f"Generated {outpath}")
    print(f"  Ingredients: {len(INGREDIENTS)}")
    print(f"  Categories:  {len(CATEGORIES)}")
    print(f"  Products:    {len(products)}")
    print(f"  Suppliers:   {len(SUPPLIERS)}")
    print(f"  Markets:     {len(MARKETS)}")
    print(f"  Incompatibilities: {len(INCOMPATIBILITIES)}")
    print(f"  Compatibilities: {len(COMPATIBILITIES)}")
