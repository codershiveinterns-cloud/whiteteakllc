// Curated map of major Indian cities -> state + representative PIN codes.
// Used for the address-autocomplete dropdown. Not exhaustive by design: if
// a city isn't in this map, the user can still type the state and PIN manually.
const CITIES = {
  "Mumbai": { state: "Maharashtra", pins: ["400001", "400002", "400020", "400049", "400050", "400058", "400070", "400101"] },
  "Pune": { state: "Maharashtra", pins: ["411001", "411004", "411007", "411014", "411028", "411038"] },
  "Nagpur": { state: "Maharashtra", pins: ["440001", "440010", "440022"] },
  "Nashik": { state: "Maharashtra", pins: ["422001", "422005", "422011"] },
  "Thane": { state: "Maharashtra", pins: ["400601", "400602", "400610"] },
  "Navi Mumbai": { state: "Maharashtra", pins: ["400703", "400705", "400614"] },

  "Delhi": { state: "Delhi", pins: ["110001", "110020", "110034", "110048", "110075", "110092"] },
  "New Delhi": { state: "Delhi", pins: ["110001", "110003", "110011", "110023"] },

  "Bengaluru": { state: "Karnataka", pins: ["560001", "560008", "560037", "560066", "560076", "560102", "560103"] },
  "Bangalore": { state: "Karnataka", pins: ["560001", "560008", "560037", "560066", "560076", "560102", "560103"] },
  "Mysuru": { state: "Karnataka", pins: ["570001", "570011", "570017"] },
  "Mysore": { state: "Karnataka", pins: ["570001", "570011", "570017"] },
  "Mangaluru": { state: "Karnataka", pins: ["575001", "575003"] },
  "Hubballi": { state: "Karnataka", pins: ["580020", "580030"] },

  "Chennai": { state: "Tamil Nadu", pins: ["600001", "600020", "600040", "600096", "600119"] },
  "Coimbatore": { state: "Tamil Nadu", pins: ["641001", "641004", "641014"] },
  "Madurai": { state: "Tamil Nadu", pins: ["625001", "625009"] },
  "Tiruchirappalli": { state: "Tamil Nadu", pins: ["620001", "620020"] },
  "Salem": { state: "Tamil Nadu", pins: ["636001", "636009"] },

  "Hyderabad": { state: "Telangana", pins: ["500001", "500008", "500032", "500081", "500084"] },
  "Warangal": { state: "Telangana", pins: ["506002", "506009"] },

  "Visakhapatnam": { state: "Andhra Pradesh", pins: ["530001", "530017"] },
  "Vijayawada": { state: "Andhra Pradesh", pins: ["520001", "520010"] },
  "Guntur": { state: "Andhra Pradesh", pins: ["522001", "522006"] },
  "Tirupati": { state: "Andhra Pradesh", pins: ["517501", "517507"] },

  "Kolkata": { state: "West Bengal", pins: ["700001", "700019", "700029", "700064", "700091"] },
  "Howrah": { state: "West Bengal", pins: ["711101", "711103"] },
  "Durgapur": { state: "West Bengal", pins: ["713203", "713205"] },
  "Siliguri": { state: "West Bengal", pins: ["734001", "734003"] },

  "Ahmedabad": { state: "Gujarat", pins: ["380001", "380009", "380015", "380054", "380058"] },
  "Surat": { state: "Gujarat", pins: ["395001", "395007", "395009"] },
  "Vadodara": { state: "Gujarat", pins: ["390001", "390007", "390020"] },
  "Rajkot": { state: "Gujarat", pins: ["360001", "360005"] },

  "Jaipur": { state: "Rajasthan", pins: ["302001", "302017", "302020"] },
  "Udaipur": { state: "Rajasthan", pins: ["313001", "313002"] },
  "Jodhpur": { state: "Rajasthan", pins: ["342001", "342008"] },
  "Kota": { state: "Rajasthan", pins: ["324001", "324005"] },

  "Lucknow": { state: "Uttar Pradesh", pins: ["226001", "226010", "226016", "226024"] },
  "Kanpur": { state: "Uttar Pradesh", pins: ["208001", "208005"] },
  "Varanasi": { state: "Uttar Pradesh", pins: ["221001", "221005"] },
  "Agra": { state: "Uttar Pradesh", pins: ["282001", "282005"] },
  "Noida": { state: "Uttar Pradesh", pins: ["201301", "201303", "201309"] },
  "Ghaziabad": { state: "Uttar Pradesh", pins: ["201001", "201009", "201014"] },
  "Meerut": { state: "Uttar Pradesh", pins: ["250001", "250002"] },
  "Allahabad": { state: "Uttar Pradesh", pins: ["211001", "211003"] },
  "Prayagraj": { state: "Uttar Pradesh", pins: ["211001", "211003"] },

  "Patna": { state: "Bihar", pins: ["800001", "800013"] },
  "Gaya": { state: "Bihar", pins: ["823001"] },
  "Bhagalpur": { state: "Bihar", pins: ["812001"] },

  "Chandigarh": { state: "Chandigarh", pins: ["160001", "160017", "160022", "160030"] },
  "Ludhiana": { state: "Punjab", pins: ["141001", "141008"] },
  "Amritsar": { state: "Punjab", pins: ["143001", "143005"] },
  "Jalandhar": { state: "Punjab", pins: ["144001", "144011"] },

  "Gurugram": { state: "Haryana", pins: ["122001", "122002", "122009", "122017"] },
  "Gurgaon": { state: "Haryana", pins: ["122001", "122002", "122009", "122017"] },
  "Faridabad": { state: "Haryana", pins: ["121001", "121006"] },
  "Panchkula": { state: "Haryana", pins: ["134109", "134112"] },

  "Bhopal": { state: "Madhya Pradesh", pins: ["462001", "462016", "462026"] },
  "Indore": { state: "Madhya Pradesh", pins: ["452001", "452010", "452016"] },
  "Gwalior": { state: "Madhya Pradesh", pins: ["474001", "474009"] },
  "Jabalpur": { state: "Madhya Pradesh", pins: ["482001", "482002"] },

  "Raipur": { state: "Chhattisgarh", pins: ["492001", "492010"] },
  "Bhilai": { state: "Chhattisgarh", pins: ["490001", "490006"] },

  "Bhubaneswar": { state: "Odisha", pins: ["751001", "751024"] },
  "Cuttack": { state: "Odisha", pins: ["753001", "753012"] },

  "Ranchi": { state: "Jharkhand", pins: ["834001", "834009"] },
  "Jamshedpur": { state: "Jharkhand", pins: ["831001", "831005"] },
  "Dhanbad": { state: "Jharkhand", pins: ["826001"] },

  "Guwahati": { state: "Assam", pins: ["781001", "781007", "781028"] },
  "Dibrugarh": { state: "Assam", pins: ["786001"] },

  "Shillong": { state: "Meghalaya", pins: ["793001"] },
  "Imphal": { state: "Manipur", pins: ["795001"] },
  "Agartala": { state: "Tripura", pins: ["799001"] },
  "Aizawl": { state: "Mizoram", pins: ["796001"] },
  "Kohima": { state: "Nagaland", pins: ["797001"] },
  "Itanagar": { state: "Arunachal Pradesh", pins: ["791111"] },
  "Gangtok": { state: "Sikkim", pins: ["737101"] },

  "Thiruvananthapuram": { state: "Kerala", pins: ["695001", "695014"] },
  "Kochi": { state: "Kerala", pins: ["682001", "682011", "682024"] },
  "Kozhikode": { state: "Kerala", pins: ["673001", "673005"] },

  "Panaji": { state: "Goa", pins: ["403001", "403002"] },
  "Margao": { state: "Goa", pins: ["403601"] },
  "Vasco da Gama": { state: "Goa", pins: ["403802"] },

  "Dehradun": { state: "Uttarakhand", pins: ["248001", "248006"] },
  "Haridwar": { state: "Uttarakhand", pins: ["249401", "249407"] },
  "Roorkee": { state: "Uttarakhand", pins: ["247667"] },

  "Shimla": { state: "Himachal Pradesh", pins: ["171001"] },
  "Dharamshala": { state: "Himachal Pradesh", pins: ["176215"] },

  "Srinagar": { state: "Jammu and Kashmir", pins: ["190001"] },
  "Jammu": { state: "Jammu and Kashmir", pins: ["180001"] },

  "Leh": { state: "Ladakh", pins: ["194101"] },
  "Puducherry": { state: "Puducherry", pins: ["605001", "605008"] },
  "Port Blair": { state: "Andaman and Nicobar Islands", pins: ["744101"] }
};

module.exports = { CITIES };
