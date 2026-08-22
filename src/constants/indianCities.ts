// A curated (not exhaustive) list of major Indian cities and towns. Powers
// the City field's autocomplete suggestions in BookingForm, and also feeds
// validateCity (see src/utils/formValidation.ts): if what's typed matches
// something in this list, the field expects an exact match (i.e. one of
// the suggestions); once nothing here matches, free text is accepted, so a
// smaller town not on this list can still just be typed in.
export const INDIAN_CITIES: string[] = [
  // Metros / very large cities
  'Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Ahmedabad', 'Chennai',
  'Kolkata', 'Surat', 'Pune', 'Jaipur',

  // State & UT capitals (and other major cities), state by state
  // Andhra Pradesh
  'Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati', 'Kurnool', 'Kakinada', 'Rajahmundry', 'Anantapur',
  // Arunachal Pradesh
  'Itanagar',
  // Assam
  'Guwahati', 'Dibrugarh', 'Silchar', 'Jorhat', 'Tezpur', 'Nagaon',
  // Bihar
  'Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Darbhanga', 'Purnia', 'Bihar Sharif', 'Arrah',
  // Chhattisgarh
  'Raipur', 'Bhilai', 'Bilaspur', 'Korba', 'Durg',
  // Goa
  'Panaji', 'Margao', 'Vasco da Gama', 'Mapusa',
  // Gujarat
  'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar', 'Gandhinagar', 'Junagadh', 'Anand', 'Nadiad', 'Morbi',
  // Haryana
  'Gurugram', 'Faridabad', 'Panipat', 'Ambala', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat', 'Yamunanagar',
  // Himachal Pradesh
  'Shimla', 'Manali', 'Dharamshala', 'Solan', 'Mandi', 'Kullu',
  // Jharkhand
  'Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Hazaribagh', 'Deoghar',
  // Karnataka
  'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi', 'Davanagere', 'Ballari', 'Shivamogga', 'Tumakuru', 'Udupi',
  // Kerala
  'Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam', 'Kannur', 'Alappuzha', 'Palakkad', 'Malappuram',
  // Madhya Pradesh
  'Bhopal', 'Indore', 'Jabalpur', 'Gwalior', 'Ujjain', 'Sagar', 'Dewas', 'Satna', 'Rewa',
  // Maharashtra
  'Nagpur', 'Nashik', 'Aurangabad', 'Solapur', 'Kolhapur', 'Amravati', 'Nanded', 'Sangli', 'Thane', 'Navi Mumbai', 'Akola', 'Latur',
  // Manipur
  'Imphal',
  // Meghalaya
  'Shillong',
  // Mizoram
  'Aizawl',
  // Nagaland
  'Kohima', 'Dimapur',
  // Odisha
  'Bhubaneswar', 'Cuttack', 'Rourkela', 'Berhampur', 'Sambalpur', 'Puri',
  // Punjab
  'Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda', 'Mohali', 'Pathankot',
  // Rajasthan
  'Jodhpur', 'Udaipur', 'Kota', 'Bikaner', 'Ajmer', 'Bhilwara', 'Alwar', 'Sikar', 'Pushkar', 'Mount Abu',
  // Sikkim
  'Gangtok',
  // Tamil Nadu
  'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thanjavur', 'Ooty',
  // Telangana
  'Warangal', 'Nizamabad', 'Karimnagar', 'Khammam',
  // Tripura
  'Agartala',
  // Uttar Pradesh
  'Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Meerut', 'Varanasi', 'Prayagraj', 'Bareilly', 'Aligarh',
  'Moradabad', 'Saharanpur', 'Gorakhpur', 'Noida', 'Firozabad', 'Jhansi', 'Mathura', 'Ayodhya',
  // Uttarakhand
  'Dehradun', 'Haridwar', 'Rishikesh', 'Nainital', 'Roorkee', 'Haldwani',
  // West Bengal
  'Howrah', 'Durgapur', 'Asansol', 'Siliguri', 'Darjeeling', 'Kharagpur',

  // Union Territories / other notable
  'Chandigarh', 'Puducherry', 'Port Blair', 'Srinagar', 'Jammu', 'Leh', 'Silvassa',
];
