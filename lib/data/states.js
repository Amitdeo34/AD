// States and union territories of India with their districts.
// District lists follow the current (post-reorganisation) administrative map;
// where a state has recently split districts, the newer units are included.

export const STATES = [
  {
    name: 'Andhra Pradesh', code: 'AP', kind: 'STATE', region: 'South', capital: 'Amaravati',
    districts: ['Alluri Sitharama Raju', 'Anakapalli', 'Ananthapuramu', 'Annamayya', 'Bapatla', 'Chittoor', 'Dr. B.R. Ambedkar Konaseema', 'East Godavari', 'Eluru', 'Guntur', 'Kakinada', 'Krishna', 'Kurnool', 'Nandyal', 'NTR', 'Palnadu', 'Parvathipuram Manyam', 'Prakasam', 'Sri Potti Sriramulu Nellore', 'Sri Sathya Sai', 'Srikakulam', 'Tirupati', 'Visakhapatnam', 'Vizianagaram', 'West Godavari', 'YSR Kadapa'],
  },
  {
    name: 'Arunachal Pradesh', code: 'AR', kind: 'STATE', region: 'North East', capital: 'Itanagar',
    districts: ['Anjaw', 'Changlang', 'Dibang Valley', 'East Kameng', 'East Siang', 'Kamle', 'Kra Daadi', 'Kurung Kumey', 'Leparada', 'Lohit', 'Longding', 'Lower Dibang Valley', 'Lower Siang', 'Lower Subansiri', 'Namsai', 'Pakke-Kessang', 'Papum Pare', 'Shi Yomi', 'Siang', 'Tawang', 'Tirap', 'Upper Siang', 'Upper Subansiri', 'West Kameng', 'West Siang'],
  },
  {
    name: 'Assam', code: 'AS', kind: 'STATE', region: 'North East', capital: 'Dispur',
    districts: ['Bajali', 'Baksa', 'Barpeta', 'Biswanath', 'Bongaigaon', 'Cachar', 'Charaideo', 'Chirang', 'Darrang', 'Dhemaji', 'Dhubri', 'Dibrugarh', 'Dima Hasao', 'Goalpara', 'Golaghat', 'Hailakandi', 'Hojai', 'Jorhat', 'Kamrup', 'Kamrup Metropolitan', 'Karbi Anglong', 'Karimganj', 'Kokrajhar', 'Lakhimpur', 'Majuli', 'Morigaon', 'Nagaon', 'Nalbari', 'Sivasagar', 'Sonitpur', 'South Salmara-Mankachar', 'Tamulpur', 'Tinsukia', 'Udalguri', 'West Karbi Anglong'],
  },
  {
    name: 'Bihar', code: 'BR', kind: 'STATE', region: 'East', capital: 'Patna',
    districts: ['Araria', 'Arwal', 'Aurangabad', 'Banka', 'Begusarai', 'Bhagalpur', 'Bhojpur', 'Buxar', 'Darbhanga', 'East Champaran', 'Gaya', 'Gopalganj', 'Jamui', 'Jehanabad', 'Kaimur', 'Katihar', 'Khagaria', 'Kishanganj', 'Lakhisarai', 'Madhepura', 'Madhubani', 'Munger', 'Muzaffarpur', 'Nalanda', 'Nawada', 'Patna', 'Purnia', 'Rohtas', 'Saharsa', 'Samastipur', 'Saran', 'Sheikhpura', 'Sheohar', 'Sitamarhi', 'Siwan', 'Supaul', 'Vaishali', 'West Champaran'],
  },
  {
    name: 'Chhattisgarh', code: 'CG', kind: 'STATE', region: 'Central', capital: 'Raipur',
    districts: ['Balod', 'Baloda Bazar', 'Balrampur-Ramanujganj', 'Bastar', 'Bemetara', 'Bijapur', 'Bilaspur', 'Dantewada', 'Dhamtari', 'Durg', 'Gariaband', 'Gaurela-Pendra-Marwahi', 'Janjgir-Champa', 'Jashpur', 'Kabirdham', 'Kanker', 'Khairagarh-Chhuikhadan-Gandai', 'Kondagaon', 'Korba', 'Koriya', 'Mahasamund', 'Manendragarh-Chirmiri-Bharatpur', 'Mohla-Manpur-Ambagarh Chowki', 'Mungeli', 'Narayanpur', 'Raigarh', 'Raipur', 'Rajnandgaon', 'Sakti', 'Sarangarh-Bilaigarh', 'Sukma', 'Surajpur', 'Surguja'],
  },
  {
    name: 'Goa', code: 'GA', kind: 'STATE', region: 'West', capital: 'Panaji',
    districts: ['North Goa', 'South Goa'],
  },
  {
    name: 'Gujarat', code: 'GJ', kind: 'STATE', region: 'West', capital: 'Gandhinagar',
    districts: ['Ahmedabad', 'Amreli', 'Anand', 'Aravalli', 'Banaskantha', 'Bharuch', 'Bhavnagar', 'Botad', 'Chhota Udepur', 'Dahod', 'Dang', 'Devbhoomi Dwarka', 'Gandhinagar', 'Gir Somnath', 'Jamnagar', 'Junagadh', 'Kheda', 'Kutch', 'Mahisagar', 'Mehsana', 'Morbi', 'Narmada', 'Navsari', 'Panchmahal', 'Patan', 'Porbandar', 'Rajkot', 'Sabarkantha', 'Surat', 'Surendranagar', 'Tapi', 'Vadodara', 'Valsad'],
  },
  {
    name: 'Haryana', code: 'HR', kind: 'STATE', region: 'North', capital: 'Chandigarh',
    districts: ['Ambala', 'Bhiwani', 'Charkhi Dadri', 'Faridabad', 'Fatehabad', 'Gurugram', 'Hisar', 'Jhajjar', 'Jind', 'Kaithal', 'Karnal', 'Kurukshetra', 'Mahendragarh', 'Nuh', 'Palwal', 'Panchkula', 'Panipat', 'Rewari', 'Rohtak', 'Sirsa', 'Sonipat', 'Yamunanagar'],
  },
  {
    name: 'Himachal Pradesh', code: 'HP', kind: 'STATE', region: 'North', capital: 'Shimla',
    districts: ['Bilaspur', 'Chamba', 'Hamirpur', 'Kangra', 'Kinnaur', 'Kullu', 'Lahaul and Spiti', 'Mandi', 'Shimla', 'Sirmaur', 'Solan', 'Una'],
  },
  {
    name: 'Jharkhand', code: 'JH', kind: 'STATE', region: 'East', capital: 'Ranchi',
    districts: ['Bokaro', 'Chatra', 'Deoghar', 'Dhanbad', 'Dumka', 'East Singhbhum', 'Garhwa', 'Giridih', 'Godda', 'Gumla', 'Hazaribagh', 'Jamtara', 'Khunti', 'Koderma', 'Latehar', 'Lohardaga', 'Pakur', 'Palamu', 'Ramgarh', 'Ranchi', 'Sahibganj', 'Seraikela-Kharsawan', 'Simdega', 'West Singhbhum'],
  },
  {
    name: 'Karnataka', code: 'KA', kind: 'STATE', region: 'South', capital: 'Bengaluru',
    districts: ['Bagalkot', 'Ballari', 'Belagavi', 'Bengaluru Rural', 'Bengaluru Urban', 'Bidar', 'Chamarajanagar', 'Chikkaballapur', 'Chikkamagaluru', 'Chitradurga', 'Dakshina Kannada', 'Davanagere', 'Dharwad', 'Gadag', 'Hassan', 'Haveri', 'Kalaburagi', 'Kodagu', 'Kolar', 'Koppal', 'Mandya', 'Mysuru', 'Raichur', 'Ramanagara', 'Shivamogga', 'Tumakuru', 'Udupi', 'Uttara Kannada', 'Vijayanagara', 'Vijayapura', 'Yadgir'],
  },
  {
    name: 'Kerala', code: 'KL', kind: 'STATE', region: 'South', capital: 'Thiruvananthapuram',
    districts: ['Alappuzha', 'Ernakulam', 'Idukki', 'Kannur', 'Kasaragod', 'Kollam', 'Kottayam', 'Kozhikode', 'Malappuram', 'Palakkad', 'Pathanamthitta', 'Thiruvananthapuram', 'Thrissur', 'Wayanad'],
  },
  {
    name: 'Madhya Pradesh', code: 'MP', kind: 'STATE', region: 'Central', capital: 'Bhopal',
    districts: ['Agar Malwa', 'Alirajpur', 'Anuppur', 'Ashoknagar', 'Balaghat', 'Barwani', 'Betul', 'Bhind', 'Bhopal', 'Burhanpur', 'Chhatarpur', 'Chhindwara', 'Damoh', 'Datia', 'Dewas', 'Dhar', 'Dindori', 'Guna', 'Gwalior', 'Harda', 'Indore', 'Jabalpur', 'Jhabua', 'Katni', 'Khandwa', 'Khargone', 'Maihar', 'Mandla', 'Mandsaur', 'Mauganj', 'Morena', 'Narmadapuram', 'Narsinghpur', 'Neemuch', 'Niwari', 'Pandhurna', 'Panna', 'Raisen', 'Rajgarh', 'Ratlam', 'Rewa', 'Sagar', 'Satna', 'Sehore', 'Seoni', 'Shahdol', 'Shajapur', 'Sheopur', 'Shivpuri', 'Sidhi', 'Singrauli', 'Tikamgarh', 'Ujjain', 'Umaria', 'Vidisha'],
  },
  {
    name: 'Maharashtra', code: 'MH', kind: 'STATE', region: 'West', capital: 'Mumbai',
    districts: ['Ahilyanagar', 'Akola', 'Amravati', 'Beed', 'Bhandara', 'Buldhana', 'Chandrapur', 'Chhatrapati Sambhajinagar', 'Dharashiv', 'Dhule', 'Gadchiroli', 'Gondia', 'Hingoli', 'Jalgaon', 'Jalna', 'Kolhapur', 'Latur', 'Mumbai City', 'Mumbai Suburban', 'Nagpur', 'Nanded', 'Nandurbar', 'Nashik', 'Palghar', 'Parbhani', 'Pune', 'Raigad', 'Ratnagiri', 'Sangli', 'Satara', 'Sindhudurg', 'Solapur', 'Thane', 'Wardha', 'Washim', 'Yavatmal'],
  },
  {
    name: 'Manipur', code: 'MN', kind: 'STATE', region: 'North East', capital: 'Imphal',
    districts: ['Bishnupur', 'Chandel', 'Churachandpur', 'Imphal East', 'Imphal West', 'Jiribam', 'Kakching', 'Kamjong', 'Kangpokpi', 'Noney', 'Pherzawl', 'Senapati', 'Tamenglong', 'Tengnoupal', 'Thoubal', 'Ukhrul'],
  },
  {
    name: 'Meghalaya', code: 'ML', kind: 'STATE', region: 'North East', capital: 'Shillong',
    districts: ['East Garo Hills', 'East Jaintia Hills', 'East Khasi Hills', 'Eastern West Khasi Hills', 'North Garo Hills', 'Ri-Bhoi', 'South Garo Hills', 'South West Garo Hills', 'South West Khasi Hills', 'West Garo Hills', 'West Jaintia Hills', 'West Khasi Hills'],
  },
  {
    name: 'Mizoram', code: 'MZ', kind: 'STATE', region: 'North East', capital: 'Aizawl',
    districts: ['Aizawl', 'Champhai', 'Hnahthial', 'Khawzawl', 'Kolasib', 'Lawngtlai', 'Lunglei', 'Mamit', 'Saitual', 'Serchhip', 'Siaha'],
  },
  {
    name: 'Nagaland', code: 'NL', kind: 'STATE', region: 'North East', capital: 'Kohima',
    districts: ['Chumoukedima', 'Dimapur', 'Kiphire', 'Kohima', 'Longleng', 'Mokokchung', 'Mon', 'Niuland', 'Noklak', 'Peren', 'Phek', 'Shamator', 'Tseminyu', 'Tuensang', 'Wokha', 'Zunheboto'],
  },
  {
    name: 'Odisha', code: 'OD', kind: 'STATE', region: 'East', capital: 'Bhubaneswar',
    districts: ['Angul', 'Balangir', 'Balasore', 'Bargarh', 'Bhadrak', 'Boudh', 'Cuttack', 'Deogarh', 'Dhenkanal', 'Gajapati', 'Ganjam', 'Jagatsinghpur', 'Jajpur', 'Jharsuguda', 'Kalahandi', 'Kandhamal', 'Kendrapara', 'Kendujhar', 'Khordha', 'Koraput', 'Malkangiri', 'Mayurbhanj', 'Nabarangpur', 'Nayagarh', 'Nuapada', 'Puri', 'Rayagada', 'Sambalpur', 'Subarnapur', 'Sundargarh'],
  },
  {
    name: 'Punjab', code: 'PB', kind: 'STATE', region: 'North', capital: 'Chandigarh',
    districts: ['Amritsar', 'Barnala', 'Bathinda', 'Faridkot', 'Fatehgarh Sahib', 'Fazilka', 'Ferozepur', 'Gurdaspur', 'Hoshiarpur', 'Jalandhar', 'Kapurthala', 'Ludhiana', 'Malerkotla', 'Mansa', 'Moga', 'Pathankot', 'Patiala', 'Rupnagar', 'Sahibzada Ajit Singh Nagar', 'Sangrur', 'Shahid Bhagat Singh Nagar', 'Sri Muktsar Sahib', 'Tarn Taran'],
  },
  {
    name: 'Rajasthan', code: 'RJ', kind: 'STATE', region: 'North', capital: 'Jaipur',
    districts: ['Ajmer', 'Alwar', 'Balotra', 'Banswara', 'Baran', 'Barmer', 'Beawar', 'Bharatpur', 'Bhilwara', 'Bikaner', 'Bundi', 'Chittorgarh', 'Churu', 'Dausa', 'Deeg', 'Dholpur', 'Didwana-Kuchaman', 'Dungarpur', 'Hanumangarh', 'Jaipur', 'Jaisalmer', 'Jalore', 'Jhalawar', 'Jhunjhunu', 'Jodhpur', 'Karauli', 'Khairthal-Tijara', 'Kota', 'Kotputli-Behror', 'Nagaur', 'Pali', 'Phalodi', 'Pratapgarh', 'Rajsamand', 'Salumbar', 'Sawai Madhopur', 'Sikar', 'Sirohi', 'Sri Ganganagar', 'Tonk', 'Udaipur'],
  },
  {
    name: 'Sikkim', code: 'SK', kind: 'STATE', region: 'North East', capital: 'Gangtok',
    districts: ['Gangtok', 'Gyalshing', 'Mangan', 'Namchi', 'Pakyong', 'Soreng'],
  },
  {
    name: 'Tamil Nadu', code: 'TN', kind: 'STATE', region: 'South', capital: 'Chennai',
    districts: ['Ariyalur', 'Chengalpattu', 'Chennai', 'Coimbatore', 'Cuddalore', 'Dharmapuri', 'Dindigul', 'Erode', 'Kallakurichi', 'Kanchipuram', 'Kanyakumari', 'Karur', 'Krishnagiri', 'Madurai', 'Mayiladuthurai', 'Nagapattinam', 'Namakkal', 'Nilgiris', 'Perambalur', 'Pudukkottai', 'Ramanathapuram', 'Ranipet', 'Salem', 'Sivaganga', 'Tenkasi', 'Thanjavur', 'Theni', 'Thoothukudi', 'Tiruchirappalli', 'Tirunelveli', 'Tirupathur', 'Tiruppur', 'Tiruvallur', 'Tiruvannamalai', 'Tiruvarur', 'Vellore', 'Viluppuram', 'Virudhunagar'],
  },
  {
    name: 'Telangana', code: 'TS', kind: 'STATE', region: 'South', capital: 'Hyderabad',
    districts: ['Adilabad', 'Bhadradri Kothagudem', 'Hanumakonda', 'Hyderabad', 'Jagtial', 'Jangaon', 'Jayashankar Bhupalpally', 'Jogulamba Gadwal', 'Kamareddy', 'Karimnagar', 'Khammam', 'Komaram Bheem Asifabad', 'Mahabubabad', 'Mahabubnagar', 'Mancherial', 'Medak', 'Medchal-Malkajgiri', 'Mulugu', 'Nagarkurnool', 'Nalgonda', 'Narayanpet', 'Nirmal', 'Nizamabad', 'Peddapalli', 'Rajanna Sircilla', 'Rangareddy', 'Sangareddy', 'Siddipet', 'Suryapet', 'Vikarabad', 'Wanaparthy', 'Warangal', 'Yadadri Bhuvanagiri'],
  },
  {
    name: 'Tripura', code: 'TR', kind: 'STATE', region: 'North East', capital: 'Agartala',
    districts: ['Dhalai', 'Gomati', 'Khowai', 'North Tripura', 'Sepahijala', 'South Tripura', 'Unakoti', 'West Tripura'],
  },
  {
    name: 'Uttar Pradesh', code: 'UP', kind: 'STATE', region: 'North', capital: 'Lucknow',
    districts: ['Agra', 'Aligarh', 'Ambedkar Nagar', 'Amethi', 'Amroha', 'Auraiya', 'Ayodhya', 'Azamgarh', 'Baghpat', 'Bahraich', 'Ballia', 'Balrampur', 'Banda', 'Barabanki', 'Bareilly', 'Basti', 'Bhadohi', 'Bijnor', 'Budaun', 'Bulandshahr', 'Chandauli', 'Chitrakoot', 'Deoria', 'Etah', 'Etawah', 'Farrukhabad', 'Fatehpur', 'Firozabad', 'Gautam Buddha Nagar', 'Ghaziabad', 'Ghazipur', 'Gonda', 'Gorakhpur', 'Hamirpur', 'Hapur', 'Hardoi', 'Hathras', 'Jalaun', 'Jaunpur', 'Jhansi', 'Kannauj', 'Kanpur Dehat', 'Kanpur Nagar', 'Kasganj', 'Kaushambi', 'Kheri', 'Kushinagar', 'Lalitpur', 'Lucknow', 'Maharajganj', 'Mahoba', 'Mainpuri', 'Mathura', 'Mau', 'Meerut', 'Mirzapur', 'Moradabad', 'Muzaffarnagar', 'Pilibhit', 'Pratapgarh', 'Prayagraj', 'Raebareli', 'Rampur', 'Saharanpur', 'Sambhal', 'Sant Kabir Nagar', 'Shahjahanpur', 'Shamli', 'Shravasti', 'Siddharthnagar', 'Sitapur', 'Sonbhadra', 'Sultanpur', 'Unnao', 'Varanasi'],
  },
  {
    name: 'Uttarakhand', code: 'UK', kind: 'STATE', region: 'North', capital: 'Dehradun',
    districts: ['Almora', 'Bageshwar', 'Chamoli', 'Champawat', 'Dehradun', 'Haridwar', 'Nainital', 'Pauri Garhwal', 'Pithoragarh', 'Rudraprayag', 'Tehri Garhwal', 'Udham Singh Nagar', 'Uttarkashi'],
  },
  {
    name: 'West Bengal', code: 'WB', kind: 'STATE', region: 'East', capital: 'Kolkata',
    districts: ['Alipurduar', 'Bankura', 'Birbhum', 'Cooch Behar', 'Dakshin Dinajpur', 'Darjeeling', 'Hooghly', 'Howrah', 'Jalpaiguri', 'Jhargram', 'Kalimpong', 'Kolkata', 'Malda', 'Murshidabad', 'Nadia', 'North 24 Parganas', 'Paschim Bardhaman', 'Paschim Medinipur', 'Purba Bardhaman', 'Purba Medinipur', 'Purulia', 'South 24 Parganas', 'Uttar Dinajpur'],
  },

  // ---- Union Territories ----
  {
    name: 'Andaman and Nicobar Islands', code: 'AN', kind: 'UT', region: 'Islands', capital: 'Port Blair',
    districts: ['Nicobar', 'North and Middle Andaman', 'South Andaman'],
  },
  {
    name: 'Chandigarh', code: 'CH', kind: 'UT', region: 'North', capital: 'Chandigarh',
    districts: ['Chandigarh'],
  },
  {
    name: 'Dadra and Nagar Haveli and Daman and Diu', code: 'DH', kind: 'UT', region: 'West', capital: 'Daman',
    districts: ['Dadra and Nagar Haveli', 'Daman', 'Diu'],
  },
  {
    name: 'Delhi', code: 'DL', kind: 'UT', region: 'North', capital: 'New Delhi',
    districts: ['Central Delhi', 'East Delhi', 'New Delhi', 'North Delhi', 'North East Delhi', 'North West Delhi', 'Shahdara', 'South Delhi', 'South East Delhi', 'South West Delhi', 'West Delhi'],
  },
  {
    name: 'Jammu and Kashmir', code: 'JK', kind: 'UT', region: 'North', capital: 'Srinagar / Jammu',
    districts: ['Anantnag', 'Bandipora', 'Baramulla', 'Budgam', 'Doda', 'Ganderbal', 'Jammu', 'Kathua', 'Kishtwar', 'Kulgam', 'Kupwara', 'Poonch', 'Pulwama', 'Rajouri', 'Ramban', 'Reasi', 'Samba', 'Shopian', 'Srinagar', 'Udhampur'],
  },
  {
    name: 'Ladakh', code: 'LA', kind: 'UT', region: 'North', capital: 'Leh',
    districts: ['Kargil', 'Leh'],
  },
  {
    name: 'Lakshadweep', code: 'LD', kind: 'UT', region: 'Islands', capital: 'Kavaratti',
    districts: ['Lakshadweep'],
  },
  {
    name: 'Puducherry', code: 'PY', kind: 'UT', region: 'South', capital: 'Puducherry',
    districts: ['Karaikal', 'Mahe', 'Puducherry', 'Yanam'],
  },
];

// District headquarters whose name differs from the district's own name.
// Everything not listed here takes the district name as its headquarters town.
export const HQ_OVERRIDES = {
  'Andhra Pradesh': { 'Alluri Sitharama Raju': 'Paderu', 'Dr. B.R. Ambedkar Konaseema': 'Amalapuram', 'East Godavari': 'Rajahmundry', 'Krishna': 'Machilipatnam', 'NTR': 'Vijayawada', 'Palnadu': 'Narasaraopet', 'Parvathipuram Manyam': 'Parvathipuram', 'Prakasam': 'Ongole', 'Sri Potti Sriramulu Nellore': 'Nellore', 'Sri Sathya Sai': 'Puttaparthi', 'West Godavari': 'Bhimavaram', 'YSR Kadapa': 'Kadapa', 'Annamayya': 'Rayachoti' },
  'Arunachal Pradesh': { 'Anjaw': 'Hawai', 'Dibang Valley': 'Anini', 'East Kameng': 'Seppa', 'East Siang': 'Pasighat', 'Kamle': 'Raga', 'Kra Daadi': 'Palin', 'Kurung Kumey': 'Koloriang', 'Leparada': 'Basar', 'Lohit': 'Tezu', 'Lower Dibang Valley': 'Roing', 'Lower Siang': 'Likabali', 'Lower Subansiri': 'Ziro', 'Papum Pare': 'Yupia', 'Shi Yomi': 'Tato', 'Siang': 'Boleng', 'Tirap': 'Khonsa', 'Upper Siang': 'Yingkiong', 'Upper Subansiri': 'Daporijo', 'West Kameng': 'Bomdila', 'West Siang': 'Aalo' },
  'Assam': { 'Cachar': 'Silchar', 'Dima Hasao': 'Haflong', 'Kamrup': 'Amingaon', 'Kamrup Metropolitan': 'Guwahati', 'Karbi Anglong': 'Diphu', 'West Karbi Anglong': 'Hamren', 'Lakhimpur': 'North Lakhimpur', 'Majuli': 'Garamur', 'South Salmara-Mankachar': 'Hatsingimari', 'Bajali': 'Pathsala', 'Baksa': 'Mushalpur', 'Chirang': 'Kajalgaon', 'Darrang': 'Mangaldoi', 'Sonitpur': 'Tezpur', 'Biswanath': 'Biswanath Chariali', 'Charaideo': 'Sonari', 'Hojai': 'Sankardev Nagar' },
  'Bihar': { 'Bhojpur': 'Arrah', 'East Champaran': 'Motihari', 'Kaimur': 'Bhabua', 'Nalanda': 'Bihar Sharif', 'Rohtas': 'Sasaram', 'Saran': 'Chhapra', 'Vaishali': 'Hajipur', 'West Champaran': 'Bettiah', 'Arwal': 'Arwal', 'Purnia': 'Purnea' },
  'Chhattisgarh': { 'Bastar': 'Jagdalpur', 'Balrampur-Ramanujganj': 'Balrampur', 'Dantewada': 'Dantewada', 'Gaurela-Pendra-Marwahi': 'Gaurela', 'Janjgir-Champa': 'Janjgir', 'Kabirdham': 'Kawardha', 'Khairagarh-Chhuikhadan-Gandai': 'Khairagarh', 'Manendragarh-Chirmiri-Bharatpur': 'Manendragarh', 'Mohla-Manpur-Ambagarh Chowki': 'Mohla', 'Koriya': 'Baikunthpur', 'Sarangarh-Bilaigarh': 'Sarangarh', 'Surguja': 'Ambikapur' },
  'Goa': { 'North Goa': 'Panaji', 'South Goa': 'Margao' },
  'Gujarat': { 'Kutch': 'Bhuj', 'Dang': 'Ahwa', 'Devbhoomi Dwarka': 'Khambhalia', 'Gir Somnath': 'Veraval', 'Banaskantha': 'Palanpur', 'Sabarkantha': 'Himmatnagar', 'Aravalli': 'Modasa', 'Mahisagar': 'Lunawada', 'Panchmahal': 'Godhra', 'Narmada': 'Rajpipla', 'Tapi': 'Vyara', 'Chhota Udepur': 'Chhota Udaipur', 'Kheda': 'Nadiad', 'Surendranagar': 'Wadhwan' },
  'Haryana': { 'Nuh': 'Nuh', 'Mahendragarh': 'Narnaul', 'Charkhi Dadri': 'Charkhi Dadri' },
  'Himachal Pradesh': { 'Kangra': 'Dharamshala', 'Kinnaur': 'Reckong Peo', 'Kullu': 'Kullu', 'Lahaul and Spiti': 'Keylong', 'Sirmaur': 'Nahan', 'Una': 'Una' },
  'Jharkhand': { 'East Singhbhum': 'Jamshedpur', 'West Singhbhum': 'Chaibasa', 'Seraikela-Kharsawan': 'Seraikela', 'Palamu': 'Daltonganj', 'Bokaro': 'Bokaro Steel City' },
  'Karnataka': { 'Bengaluru Urban': 'Bengaluru', 'Bengaluru Rural': 'Devanahalli', 'Dakshina Kannada': 'Mangaluru', 'Uttara Kannada': 'Karwar', 'Kodagu': 'Madikeri', 'Vijayanagara': 'Hosapete', 'Vijayapura': 'Vijayapura', 'Chamarajanagar': 'Chamarajanagar', 'Dharwad': 'Dharwad' },
  'Kerala': { 'Wayanad': 'Kalpetta', 'Idukki': 'Painavu', 'Ernakulam': 'Kakkanad', 'Kozhikode': 'Kozhikode', 'Kasaragod': 'Kasaragod' },
  'Madhya Pradesh': { 'Narmadapuram': 'Narmadapuram', 'Agar Malwa': 'Agar', 'Niwari': 'Niwari', 'Alirajpur': 'Alirajpur', 'Umaria': 'Umaria' },
  'Maharashtra': { 'Mumbai City': 'Mumbai', 'Mumbai Suburban': 'Bandra', 'Ahilyanagar': 'Ahilyanagar', 'Chhatrapati Sambhajinagar': 'Chhatrapati Sambhajinagar', 'Dharashiv': 'Dharashiv', 'Raigad': 'Alibaug', 'Sindhudurg': 'Oros', 'Palghar': 'Palghar', 'Gondia': 'Gondia' },
  'Manipur': { 'Imphal East': 'Porompat', 'Imphal West': 'Imphal', 'Bishnupur': 'Bishnupur', 'Senapati': 'Senapati', 'Noney': 'Noney', 'Pherzawl': 'Pherzawl', 'Kangpokpi': 'Kangpokpi' },
  'Meghalaya': { 'East Khasi Hills': 'Shillong', 'West Khasi Hills': 'Nongstoin', 'Eastern West Khasi Hills': 'Mairang', 'South West Khasi Hills': 'Mawkyrwat', 'Ri-Bhoi': 'Nongpoh', 'West Jaintia Hills': 'Jowai', 'East Jaintia Hills': 'Khliehriat', 'West Garo Hills': 'Tura', 'East Garo Hills': 'Williamnagar', 'North Garo Hills': 'Resubelpara', 'South Garo Hills': 'Baghmara', 'South West Garo Hills': 'Ampati' },
  'Mizoram': { 'Siaha': 'Siaha', 'Saitual': 'Saitual' },
  'Nagaland': { 'Chumoukedima': 'Chumoukedima', 'Niuland': 'Niuland' },
  'Odisha': { 'Khordha': 'Bhubaneswar', 'Kendujhar': 'Keonjhar', 'Balasore': 'Baleswar', 'Gajapati': 'Paralakhemundi', 'Ganjam': 'Chhatrapur', 'Kandhamal': 'Phulbani', 'Kalahandi': 'Bhawanipatna', 'Subarnapur': 'Sonepur', 'Boudh': 'Boudh', 'Mayurbhanj': 'Baripada', 'Nabarangpur': 'Nabarangpur', 'Deogarh': 'Debagarh' },
  'Punjab': { 'Sahibzada Ajit Singh Nagar': 'Mohali', 'Shahid Bhagat Singh Nagar': 'Nawanshahr', 'Rupnagar': 'Ropar', 'Fatehgarh Sahib': 'Fatehgarh Sahib', 'Sri Muktsar Sahib': 'Muktsar' },
  'Rajasthan': { 'Sawai Madhopur': 'Sawai Madhopur', 'Didwana-Kuchaman': 'Didwana', 'Khairthal-Tijara': 'Khairthal', 'Kotputli-Behror': 'Kotputli', 'Sri Ganganagar': 'Sri Ganganagar', 'Rajsamand': 'Rajsamand' },
  'Sikkim': { 'Gangtok': 'Gangtok', 'Gyalshing': 'Gyalshing', 'Mangan': 'Mangan', 'Soreng': 'Soreng' },
  'Tamil Nadu': { 'Nilgiris': 'Udhagamandalam', 'Kanyakumari': 'Nagercoil', 'Chengalpattu': 'Chengalpattu', 'Sivaganga': 'Sivaganga', 'Ramanathapuram': 'Ramanathapuram', 'Viluppuram': 'Viluppuram', 'Tirupathur': 'Tirupathur', 'Mayiladuthurai': 'Mayiladuthurai' },
  'Telangana': { 'Medchal-Malkajgiri': 'Shamirpet', 'Rangareddy': 'Shamshabad', 'Bhadradri Kothagudem': 'Kothagudem', 'Komaram Bheem Asifabad': 'Asifabad', 'Jayashankar Bhupalpally': 'Bhupalpally', 'Jogulamba Gadwal': 'Gadwal', 'Rajanna Sircilla': 'Sircilla', 'Yadadri Bhuvanagiri': 'Bhongir', 'Hanumakonda': 'Hanumakonda', 'Mulugu': 'Mulugu' },
  'Tripura': { 'West Tripura': 'Agartala', 'North Tripura': 'Dharmanagar', 'South Tripura': 'Belonia', 'Dhalai': 'Ambassa', 'Gomati': 'Udaipur', 'Khowai': 'Khowai', 'Sepahijala': 'Bishramganj', 'Unakoti': 'Kailashahar' },
  'Uttar Pradesh': { 'Gautam Buddha Nagar': 'Noida', 'Kanpur Nagar': 'Kanpur', 'Kanpur Dehat': 'Akbarpur', 'Kheri': 'Lakhimpur', 'Ambedkar Nagar': 'Akbarpur', 'Sant Kabir Nagar': 'Khalilabad', 'Bhadohi': 'Gyanpur', 'Shravasti': 'Bhinga', 'Siddharthnagar': 'Naugarh', 'Kaushambi': 'Manjhanpur', 'Kushinagar': 'Padrauna', 'Amethi': 'Gauriganj', 'Hathras': 'Hathras', 'Chitrakoot': 'Karwi' },
  'Uttarakhand': { 'Pauri Garhwal': 'Pauri', 'Tehri Garhwal': 'New Tehri', 'Udham Singh Nagar': 'Rudrapur', 'Nainital': 'Nainital', 'Chamoli': 'Gopeshwar', 'Rudraprayag': 'Rudraprayag', 'Uttarkashi': 'Uttarkashi' },
  'West Bengal': { 'North 24 Parganas': 'Barasat', 'South 24 Parganas': 'Alipore', 'Paschim Bardhaman': 'Asansol', 'Purba Bardhaman': 'Bardhaman', 'Paschim Medinipur': 'Medinipur', 'Purba Medinipur': 'Tamluk', 'Dakshin Dinajpur': 'Balurghat', 'Uttar Dinajpur': 'Raiganj', 'Birbhum': 'Suri', 'Nadia': 'Krishnanagar', 'Hooghly': 'Chinsurah', 'Cooch Behar': 'Cooch Behar' },
  'Andaman and Nicobar Islands': { 'South Andaman': 'Port Blair', 'North and Middle Andaman': 'Mayabunder', 'Nicobar': 'Car Nicobar' },
  'Dadra and Nagar Haveli and Daman and Diu': { 'Dadra and Nagar Haveli': 'Silvassa' },
  'Delhi': { 'Central Delhi': 'Daryaganj', 'East Delhi': 'Preet Vihar', 'New Delhi': 'Connaught Place', 'North Delhi': 'Civil Lines', 'North East Delhi': 'Seelampur', 'North West Delhi': 'Rohini', 'Shahdara': 'Shahdara', 'South Delhi': 'Saket', 'South East Delhi': 'Hauz Khas', 'South West Delhi': 'Dwarka', 'West Delhi': 'Rajouri Garden' },
  'Jammu and Kashmir': { 'Budgam': 'Budgam', 'Bandipora': 'Bandipora', 'Ganderbal': 'Ganderbal' },
  'Lakshadweep': { 'Lakshadweep': 'Kavaratti' },
  'Puducherry': { 'Puducherry': 'Puducherry' },
};

// Settlements large enough to be listed as cities rather than towns.
export const CITY_NAMES = new Set(['Mumbai', 'Delhi', 'Bengaluru', 'Hyderabad', 'Chennai', 'Kolkata', 'Pune', 'Ahmedabad', 'Surat', 'Jaipur', 'Lucknow', 'Kanpur', 'Nagpur', 'Indore', 'Bhopal', 'Visakhapatnam', 'Patna', 'Vadodara', 'Ghaziabad', 'Ludhiana', 'Agra', 'Nashik', 'Faridabad', 'Meerut', 'Rajkot', 'Varanasi', 'Srinagar', 'Aurangabad', 'Chhatrapati Sambhajinagar', 'Dhanbad', 'Amritsar', 'Prayagraj', 'Ranchi', 'Howrah', 'Coimbatore', 'Jabalpur', 'Gwalior', 'Vijayawada', 'Jodhpur', 'Madurai', 'Raipur', 'Kota', 'Chandigarh', 'Guwahati', 'Solapur', 'Hubballi', 'Mysuru', 'Tiruchirappalli', 'Bareilly', 'Moradabad', 'Tiruppur', 'Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Bhubaneswar', 'Cuttack', 'Dehradun', 'Noida', 'Gurugram', 'Jamshedpur', 'Bhilai', 'Warangal', 'Salem', 'Guntur', 'Bhiwandi', 'Saharanpur', 'Gorakhpur', 'Bikaner', 'Amravati', 'Jamnagar', 'Ujjain', 'Mangaluru', 'Belagavi', 'Kalaburagi', 'Jalandhar', 'Udaipur', 'Siliguri', 'Nellore', 'Ajmer', 'Akola', 'Jhansi', 'Panaji', 'Shimla', 'Puducherry', 'Kollam', 'Alappuzha', 'Kannur', 'Rourkela', 'Durgapur', 'Asansol', 'Bardhaman', 'Malegaon', 'Kolhapur', 'Nanded', 'Sangli', 'Latur', 'Ahilyanagar', 'Kurnool', 'Rajahmundry', 'Kakinada', 'Tirupati', 'Bilaspur', 'Korba', 'Muzaffarpur', 'Gaya', 'Bhagalpur', 'Darbhanga', 'Aligarh', 'Firozabad', 'Mathura', 'Shahjahanpur', 'Rampur', 'Muzaffarnagar', 'Patiala', 'Bathinda', 'Panipat', 'Karnal', 'Hisar', 'Rohtak', 'Sonipat', 'Ambala', 'Haridwar', 'Bhavnagar', 'Junagadh', 'Gandhinagar', 'Anand', 'Bharuch', 'Nadiad', 'Navsari', 'Silvassa', 'Imphal', 'Agartala', 'Aizawl', 'Kohima', 'Dimapur', 'Shillong', 'Itanagar', 'Gangtok', 'Jammu', 'Leh', 'Port Blair', 'Vellore', 'Erode', 'Thoothukudi', 'Dindigul', 'Thanjavur', 'Tirunelveli', 'Nizamabad', 'Karimnagar', 'Khammam', 'Ramagundam', 'Shivamogga', 'Tumakuru', 'Davanagere', 'Ballari', 'Bidar', 'Hosapete', 'Udupi', 'Sambalpur', 'Berhampur', 'Puri', 'Bokaro Steel City', 'Hazaribagh', 'Deoghar', 'Satna', 'Rewa', 'Sagar', 'Ratlam', 'Dewas', 'Singrauli', 'Chandrapur', 'Jalgaon', 'Nagercoil', 'Kavaratti', 'Margao', 'Vasco da Gama', 'Silchar', 'Dibrugarh', 'Jorhat', 'Tezpur', 'Nagaon']);
