// Movie bank for "Dumb Charades: Tamil Movies". One line per film:
//   Title | Year | Heroes | Heroines | Director | Comedians
// Multiple names are comma-separated; Comedians (and Heroines for heroine-less
// films) may be left empty. Spell each person the same way everywhere, because
// the category pickers are built by matching these strings exactly.
// These are the built-in films. The admin can replace the whole list in
// Admin -> Games -> Dumb Charades (see sanitizeMovies); categories (decade /
// hero / heroine / director / comedian) are rebuilt from whichever list is
// live, and a person only gets their own category entry once they have
// MIN_PER_CATEGORY films in it.

const RAW = `
Parasakthi|1952|Sivaji Ganesan|Pandari Bai|Krishnan-Panju|
Nadodi Mannan|1958|M. G. Ramachandran|B. Saroja Devi, P. Bhanumathi|M. G. Ramachandran|
Veerapandiya Kattabomman|1959|Sivaji Ganesan|Padmini|B. R. Panthulu|
Pasamalar|1961|Sivaji Ganesan|Savitri|A. Bhimsingh|
Kadhalikka Neramillai|1964|Ravichandran|Kanchana|C. V. Sridhar|Nagesh
Thiruvilaiyadal|1965|Sivaji Ganesan|Savitri|A. P. Nagarajan|Nagesh
Aayirathil Oruvan|1965|M. G. Ramachandran|Jayalalithaa|B. R. Panthulu|
Enga Veettu Pillai|1965|M. G. Ramachandran|B. Saroja Devi|Chanakya|
Thillana Mohanambal|1968|Sivaji Ganesan|Padmini|A. P. Nagarajan|
Vasantha Maligai|1972|Sivaji Ganesan|Vanisri|K. S. Prakash Rao|
Ulagam Sutrum Valiban|1973|M. G. Ramachandran|Manjula, Latha|M. G. Ramachandran|
Apoorva Raagangal|1975|Kamal Haasan, Rajinikanth|Srividya, Jayasudha|K. Balachander|
16 Vayathinile|1977|Kamal Haasan, Rajinikanth|Sridevi|Bharathiraja|
Mullum Malarum|1978|Rajinikanth|Shobha|J. Mahendran|
Aval Appadithan|1978|Kamal Haasan, Rajinikanth|Sripriya|C. Rudhraiah|
Sigappu Rojakkal|1978|Kamal Haasan|Sridevi|Bharathiraja|
Billa|1980|Rajinikanth|Sripriya|R. Krishnamoorthy|
Johnny|1980|Rajinikanth|Sridevi|J. Mahendran|
Varumayin Niram Sivappu|1980|Kamal Haasan|Sridevi|K. Balachander|
Thillu Mullu|1981|Rajinikanth|Madhavi|K. Balachander|Thengai Srinivasan
Moondram Pirai|1982|Kamal Haasan|Sridevi|Balu Mahendra|
Sakalakala Vallavan|1982|Kamal Haasan|Ambika, Radha|S. P. Muthuraman|
Mundhanai Mudichu|1983|K. Bhagyaraj|Urvashi|K. Bhagyaraj|
Sindhu Bhairavi|1985|Sivakumar|Suhasini|K. Balachander|
Mudhal Mariyadhai|1985|Sivaji Ganesan|Radha|Bharathiraja|
Mouna Ragam|1986|Mohan, Karthik|Revathi|Mani Ratnam|
Punnagai Mannan|1986|Kamal Haasan|Revathi, Rekha|K. Balachander|
Nayakan|1987|Kamal Haasan|Saranya, Karthika|Mani Ratnam|
Agni Natchathiram|1988|Prabhu, Karthik|Amala, Nirosha|Mani Ratnam|
Karakattakaran|1989|Ramarajan|Kanaka|Gangai Amaran|Goundamani, Senthil
Apoorva Sagodharargal|1989|Kamal Haasan|Gautami, Rupini|Singeetam Srinivasa Rao|
Michael Madana Kama Rajan|1990|Kamal Haasan|Khushbu, Urvashi, Roopini|Singeetam Srinivasa Rao|
Chinna Thambi|1991|Prabhu|Khushbu|P. Vasu|Goundamani
Thalapathi|1991|Rajinikanth, Mammootty|Shobana|Mani Ratnam|
Roja|1992|Arvind Swamy|Madhoo|Mani Ratnam|
Annamalai|1992|Rajinikanth|Khushbu|Suresh Krishna|Senthil
Mannan|1992|Rajinikanth|Vijayashanti, Khushbu|P. Vasu|Goundamani
Thevar Magan|1992|Kamal Haasan, Sivaji Ganesan|Revathi, Gautami|Bharathan|
Singaravelan|1992|Kamal Haasan|Khushbu|R. V. Udayakumar|Goundamani
Chinna Gounder|1992|Vijayakanth|Sukanya|R. V. Udayakumar|Goundamani, Senthil
Gentleman|1993|Arjun Sarja|Madhubala|Shankar|Goundamani
Ejamaan|1993|Rajinikanth|Meena|R. V. Udayakumar|Goundamani
Kaadhalan|1994|Prabhu Deva|Nagma|Shankar|Vadivelu
Duet|1994|Prabhu|Meenakshi Seshadri|K. Balachander|
Nattamai|1994|Sarathkumar|Meena, Kushboo|K. S. Ravikumar|Goundamani
Veera|1994|Rajinikanth|Meena, Roja|Suresh Krishna|
Aasai|1995|Ajith Kumar|Suvalakshmi|Vasanth|
Baashha|1995|Rajinikanth|Nagma|Suresh Krishna|
Muthu|1995|Rajinikanth|Meena|K. S. Ravikumar|
Bombay|1995|Arvind Swamy|Manisha Koirala|Mani Ratnam|
Kuruthipunal|1995|Kamal Haasan|Gautami|P. C. Sreeram|
Indian|1996|Kamal Haasan|Manisha Koirala, Urmila Matondkar|Shankar|Goundamani, Senthil
Avvai Shanmugi|1996|Kamal Haasan|Meena|K. S. Ravikumar|
Kadhal Kottai|1996|Ajith Kumar|Devayani|Agathiyan|
Kadhal Desam|1996|Abbas, Vineeth|Tabu|Kathir|Vadivelu
Ullathai Allitha|1996|Karthik|Rambha|Sundar C|Goundamani, Senthil
Minsara Kanavu|1997|Prabhu Deva, Arvind Swamy|Kajol|Rajiv Menon|
Kadhalukku Mariyadhai|1997|Vijay|Shalini|Fazil|
Nerukku Ner|1997|Vijay, Suriya|Simran, Kausalya|Vasanth|
Suryavamsam|1997|Sarathkumar|Devayani|Vikraman|
Arunachalam|1997|Rajinikanth|Soundarya, Rambha|Sundar C|
Kadhal Mannan|1998|Ajith Kumar|Maanu|Saran|
Vaali|1999|Ajith Kumar|Simran, Jyothika|S. J. Suryah|
Amarkalam|1999|Ajith Kumar|Shalini|Saran|
Mudhalvan|1999|Arjun Sarja|Manisha Koirala|Shankar|
Padayappa|1999|Rajinikanth|Soundarya, Ramya Krishnan|K. S. Ravikumar|
Sethu|1999|Vikram|Abitha|Bala|
Poovellam Kettupar|1999|Suriya|Jyothika|Vasanth|
Thullatha Manamum Thullum|1999|Vijay|Simran|Ezhil|
Alaipayuthey|2000|R. Madhavan|Shalini|Mani Ratnam|
Mugavari|2000|Ajith Kumar|Jyothika|V. Z. Durai|
Kushi|2000|Vijay|Jyothika|S. J. Suryah|
Hey Ram|2000|Kamal Haasan|Rani Mukerji, Vasundhara Das|Kamal Haasan|
Minnale|2001|R. Madhavan|Reema Sen|Gautham Menon|Vivek
Citizen|2001|Ajith Kumar|Vasundhara Das, Meena|Saravana Subbiah|
Dheena|2001|Ajith Kumar|Laila|A. R. Murugadoss|
Friends|2001|Vijay, Suriya|Devayani, Vijayalakshmi|Siddique|Vadivelu
Nandha|2001|Suriya|Laila|Bala|
Dhill|2001|Vikram|Laila|Dharani|
Aalavandhan|2001|Kamal Haasan|Manisha Koirala, Raveena Tandon|Suresh Krishna|
Ramana|2002|Vijayakanth|Simran|A. R. Murugadoss|
Run|2002|R. Madhavan|Meera Jasmine|N. Lingusamy|Vivek
Kannathil Muthamittal|2002|R. Madhavan|Simran|Mani Ratnam|
Gemini|2002|Vikram|Kiran Rathod|Saran|
Panchathantiram|2002|Kamal Haasan|Simran, Ramya Krishnan|K. S. Ravikumar|
Anbe Sivam|2003|Kamal Haasan, R. Madhavan|Kiran Rathod|Sundar C|
Kaakha Kaakha|2003|Suriya|Jyothika|Gautham Menon|
Pithamagan|2003|Vikram, Suriya|Sangeetha, Laila|Bala|
Dhool|2003|Vikram|Jyothika|Dharani|Vivek
Saamy|2003|Vikram|Trisha|Hari|
Jayam|2003|Jayam Ravi|Sadha|M. Raja|
Thirumalai|2003|Vijay|Jyothika|Ramana|Vivek
Kadhal Kondein|2003|Dhanush|Sonia Agarwal|Selvaraghavan|
Ghilli|2004|Vijay|Trisha|Dharani|
Autograph|2004|Cheran|Gopika, Sneha|Cheran|
7G Rainbow Colony|2004|Ravi Krishna|Sonia Agarwal|Selvaraghavan|
Kadhal|2004|Bharath|Sandhya|Balaji Sakthivel|
Vasool Raja MBBS|2004|Kamal Haasan|Sneha|Saran|
M. Kumaran S/O Mahalakshmi|2004|Jayam Ravi|Asin|M. Raja|
Manmadhan|2004|Silambarasan|Jyothika, Sindhu Tolani|A. J. Murugan|
Ayutha Ezhuthu|2004|Suriya, R. Madhavan, Siddharth|Trisha, Esha Deol, Meera Jasmine|Mani Ratnam|
Chandramukhi|2005|Rajinikanth|Jyothika, Nayanthara|P. Vasu|Vadivelu
Anniyan|2005|Vikram|Sadha|Shankar|Vivek
Ghajini|2005|Suriya|Asin, Nayanthara|A. R. Murugadoss|
Aaru|2005|Suriya|Trisha|Hari|Vadivelu
Sandakozhi|2005|Vishal|Meera Jasmine|N. Lingusamy|
Aathi|2006|Vijay|Trisha|Ramana|Vadivelu
Varalaru|2006|Ajith Kumar|Asin, Kanika|K. S. Ravikumar|
Vettaiyadu Vilaiyadu|2006|Kamal Haasan|Jyothika, Kamalinee Mukherjee|Gautham Menon|
Pudhupettai|2006|Dhanush|Sneha, Sonia Agarwal|Selvaraghavan|
Vallavan|2006|Silambarasan|Nayanthara, Reema Sen|Silambarasan|
Sivaji: The Boss|2007|Rajinikanth|Shriya Saran|Shankar|Vivek
Pokkiri|2007|Vijay|Asin|Prabhu Deva|Vadivelu
Billa|2007|Ajith Kumar|Nayanthara, Namitha|Vishnuvardhan|
Kireedam|2007|Ajith Kumar|Trisha|A. L. Vijay|
Paruthiveeran|2007|Karthi|Priyamani|Ameer|
Polladhavan|2007|Dhanush|Divya Spandana|Vetrimaaran|
Chennai 600028|2007|Shiva, Jai|Vijayalakshmi|Venkat Prabhu|
Vel|2007|Suriya|Asin|Hari|
Azhagiya Tamil Magan|2007|Vijay|Shriya Saran, Namitha|Bharathan|
Dasavatharam|2008|Kamal Haasan|Asin|K. S. Ravikumar|
Vaaranam Aayiram|2008|Suriya|Simran, Sameera Reddy, Divya Spandana|Gautham Menon|
Subramaniapuram|2008|Jai|Swathi Reddy|M. Sasikumar|
Santhosh Subramaniam|2008|Jayam Ravi|Genelia D'Souza|M. Raja|
Yaaradi Nee Mohini|2008|Dhanush|Nayanthara|Jawahar|
Villu|2009|Vijay|Nayanthara|Prabhu Deva|Vadivelu
Aadhavan|2009|Suriya|Nayanthara|K. S. Ravikumar|Vadivelu
Ayan|2009|Suriya|Tamannaah|K. V. Anand|
Naan Kadavul|2009|Arya|Pooja Umashankar|Bala|
Naadodigal|2009|Sasikumar|Ananya, Abhinaya|Samuthirakani|
Siva Manasula Sakthi|2009|Jiiva|Anuya Bhagvath|M. Rajesh|Santhanam
Vettaikaaran|2009|Vijay|Anushka Shetty|Babusivan|
Enthiran|2010|Rajinikanth|Aishwarya Rai|Shankar|
Vinnaithaandi Varuvaayaa|2010|Silambarasan|Trisha|Gautham Menon|
Singam|2010|Suriya|Anushka Shetty|Hari|Vivek
Raavanan|2010|Vikram|Aishwarya Rai|Mani Ratnam|
Boss Engira Bhaskaran|2010|Arya|Nayanthara|M. Rajesh|Santhanam
Paiyaa|2010|Karthi|Tamannaah|N. Lingusamy|
Madrasapattinam|2010|Arya|Amy Jackson|A. L. Vijay|
Mynaa|2010|Vidharth|Amala Paul|Prabhu Solomon|
Aayirathil Oruvan|2010|Karthi|Reema Sen, Andrea Jeremiah|Selvaraghavan|
Mankatha|2011|Ajith Kumar|Trisha, Anjali, Lakshmi Rai|Venkat Prabhu|Premgi Amaren
7aum Arivu|2011|Suriya|Shruti Haasan|A. R. Murugadoss|
Aadukalam|2011|Dhanush|Taapsee Pannu|Vetrimaaran|
Mayakkam Enna|2011|Dhanush|Richa Gangopadhyay|Selvaraghavan|
Siruthai|2011|Karthi|Tamannaah|Siva|Santhanam
Kanchana|2011|Raghava Lawrence|Lakshmi Rai|Raghava Lawrence|Kovai Sarala
Kavalan|2011|Vijay|Asin|Siddique|Vadivelu
Velayudham|2011|Vijay|Hansika Motwani, Genelia D'Souza|M. Raja|Santhanam
Ko|2011|Jiiva|Karthika Nair|K. V. Anand|
Deiva Thirumagal|2011|Vikram|Anushka Shetty|A. L. Vijay|
Engeyum Eppothum|2011|Jai, Sharvanand|Anjali, Ananya|M. Saravanan|
Mouna Guru|2011|Arulnithi|Iniya|Santha Kumar|
Osthe|2011|Silambarasan|Richa Gangopadhyay|Dharani|
Thuppakki|2012|Vijay|Kajal Aggarwal|A. R. Murugadoss|Sathyan
Nanban|2012|Vijay, Jiiva, Srikanth|Ileana D'Cruz|Shankar|
Maattrraan|2012|Suriya|Kajal Aggarwal|K. V. Anand|
3|2012|Dhanush|Shruti Haasan|Aishwarya Rajinikanth|Sivakarthikeyan
Pizza|2012|Vijay Sethupathi|Remya Nambeesan|Karthik Subbaraj|
Attakathi|2012|Dinesh|Nandita Swetha|Pa. Ranjith|
Kalakalappu|2012|Vimal, Shiva|Anjali, Oviya|Sundar C|Santhanam
Kadhalil Sodhappuvadhu Yeppadi|2012|Siddharth|Amala Paul|Balaji Mohan|
Naduvula Konjam Pakkatha Kaanom|2012|Vijay Sethupathi|Gayathrie|Balaji Tharaneetharan|
Vishwaroopam|2013|Kamal Haasan|Pooja Kumar, Andrea Jeremiah|Kamal Haasan|
Raja Rani|2013|Arya, Jai|Nayanthara, Nazriya Nazim|Atlee|Santhanam
Pandiya Naadu|2013|Vishal|Lakshmi Menon|Suseenthiran|Soori
Soodhu Kavvum|2013|Vijay Sethupathi|Sanchita Shetty|Nalan Kumarasamy|
Ethir Neechal|2013|Sivakarthikeyan|Priya Anand|R. S. Durai Senthilkumar|
Varuthapadatha Valibar Sangam|2013|Sivakarthikeyan|Sri Divya|Ponram|Soori
Singam II|2013|Suriya|Anushka Shetty, Hansika Motwani|Hari|Santhanam
Veeram|2014|Ajith Kumar|Tamannaah|Siva|Santhanam
Kaththi|2014|Vijay|Samantha|A. R. Murugadoss|Sathish
Madras|2014|Karthi|Catherine Tresa|Pa. Ranjith|
Jigarthanda|2014|Siddharth, Bobby Simha|Lakshmi Menon|Karthik Subbaraj|
Velaiilla Pattadhari|2014|Dhanush|Amala Paul|Velraj|Vivek
Kaaka Muttai|2014|Vignesh, Ramesh|Aishwarya Rajesh|M. Manikandan|
Pannaiyarum Padminiyum|2014|Vijay Sethupathi|Aishwarya Rajesh|S. U. Arun Kumar|
Maan Karate|2014|Sivakarthikeyan|Hansika Motwani|Thirukumaran|Soori
Yennai Arindhaal|2015|Ajith Kumar|Trisha, Anushka Shetty|Gautham Menon|
Vedalam|2015|Ajith Kumar|Shruti Haasan, Lakshmi Menon|Siva|Soori
I|2015|Vikram|Amy Jackson|Shankar|Santhanam
Thani Oruvan|2015|Jayam Ravi|Nayanthara|Mohan Raja|
Naanum Rowdy Dhaan|2015|Vijay Sethupathi|Nayanthara|Vignesh Shivan|RJ Balaji
Maari|2015|Dhanush|Kajal Aggarwal|Balaji Mohan|Robo Shankar
Papanasam|2015|Kamal Haasan|Gautami|Jeethu Joseph|
Ok Kanmani|2015|Dulquer Salmaan|Nithya Menen|Mani Ratnam|
Visaranai|2015|Dinesh|Anandhi|Vetrimaaran|
Komban|2015|Karthi|Lakshmi Menon|M. Muthaiah|
Maya|2015|Nayanthara|Nayanthara|Ashwin Saravanan|
Kaaki Sattai|2015|Sivakarthikeyan|Sri Divya|R. S. Durai Senthilkumar|
Theri|2016|Vijay|Samantha, Amy Jackson|Atlee|
Kabali|2016|Rajinikanth|Radhika Apte|Pa. Ranjith|
Remo|2016|Sivakarthikeyan|Keerthy Suresh|Bakkiyaraj Kannan|Sathish
Rajini Murugan|2016|Sivakarthikeyan|Keerthy Suresh|Ponram|Soori
Pichaikkaran|2016|Vijay Antony|Satna Titus|Sasi|
Sethupathi|2016|Vijay Sethupathi|Remya Nambeesan|S. U. Arun Kumar|
Thozha|2016|Karthi, Nagarjuna|Tamannaah|Vamshi Paidipally|
Mersal|2017|Vijay|Kajal Aggarwal, Samantha, Nithya Menen|Atlee|Vadivelu
Vikram Vedha|2017|R. Madhavan, Vijay Sethupathi|Shraddha Srinath|Pushkar-Gayathri|
Velaikkaran|2017|Sivakarthikeyan|Nayanthara|Mohan Raja|
Theeran Adhigaaram Ondru|2017|Karthi|Rakul Preet Singh|H. Vinoth|
Aramm|2017|Nayanthara|Nayanthara|Gopi Nainar|
Maanagaram|2017|Sundeep Kishan|Regina Cassandra|Lokesh Kanagaraj|
Bairavaa|2017|Vijay|Keerthy Suresh|Bharathan|
Sarkar|2018|Vijay|Keerthy Suresh|A. R. Murugadoss|
2.0|2018|Rajinikanth, Akshay Kumar|Amy Jackson|Shankar|
Kaala|2018|Rajinikanth|Huma Qureshi|Pa. Ranjith|
96|2018|Vijay Sethupathi|Trisha|C. Prem Kumar|
Vada Chennai|2018|Dhanush|Aishwarya Rajesh, Andrea Jeremiah|Vetrimaaran|
Ratsasan|2018|Vishnu Vishal|Amala Paul|Ram Kumar|
Pariyerum Perumal|2018|Kathir|Anandhi|Mari Selvaraj|
Irumbu Thirai|2018|Vishal|Samantha|P. S. Mithran|
Seemaraja|2018|Sivakarthikeyan|Samantha|Ponram|Soori
Kolamaavu Kokila|2018|Nayanthara|Nayanthara|Nelson|Yogi Babu
Kadaikutty Singam|2018|Karthi|Sayyeshaa|Pandiraj|Soori
Imaikkaa Nodigal|2018|Atharvaa, Nayanthara|Raashii Khanna|R. Ajay Gnanamuthu|
Super Deluxe|2019|Vijay Sethupathi, Fahadh Faasil|Samantha, Ramya Krishnan|Thiagarajan Kumararaja|
Petta|2019|Rajinikanth|Simran, Trisha|Karthik Subbaraj|
Viswasam|2019|Ajith Kumar|Nayanthara|Siva|Yogi Babu, Robo Shankar
Nerkonda Paarvai|2019|Ajith Kumar|Vidya Balan, Shraddha Srinath|H. Vinoth|
Bigil|2019|Vijay|Nayanthara|Atlee|Yogi Babu, Vivek
Kaithi|2019|Karthi||Lokesh Kanagaraj|
Asuran|2019|Dhanush|Manju Warrier|Vetrimaaran|
Comali|2019|Jayam Ravi|Kajal Aggarwal, Samyuktha Hegde|Pradeep Ranganathan|Yogi Babu
Namma Veettu Pillai|2019|Sivakarthikeyan|Aishwarya Rajesh|Pandiraj|Soori
Thadam|2019|Arun Vijay|Smruthi Venkat, Tanya Hope|Magizh Thirumeni|
Darbar|2020|Rajinikanth|Nayanthara|A. R. Murugadoss|Yogi Babu
Soorarai Pottru|2020|Suriya|Aparna Balamurali|Sudha Kongara|
Pattas|2020|Dhanush|Mehreen Pirzada, Sneha|R. S. Durai Senthilkumar|
Oh My Kadavule|2020|Ashok Selvan|Ritika Singh, Vani Bhojan|Ashwath Marimuthu|
Mookuthi Amman|2020|RJ Balaji|Nayanthara|RJ Balaji|
Master|2021|Vijay, Vijay Sethupathi|Malavika Mohanan|Lokesh Kanagaraj|
Karnan|2021|Dhanush|Rajisha Vijayan|Mari Selvaraj|
Jai Bhim|2021|Suriya|Lijomol Jose, Rajisha Vijayan|T. J. Gnanavel|
Doctor|2021|Sivakarthikeyan|Priyanka Mohan|Nelson|Yogi Babu
Annaatthe|2021|Rajinikanth|Nayanthara, Keerthy Suresh, Meena, Khushbu|Siva|Soori
Maanaadu|2021|Silambarasan|Kalyani Priyadarshan|Venkat Prabhu|
Sarpatta Parambarai|2021|Arya|Dushara Vijayan|Pa. Ranjith|
Sulthan|2021|Karthi|Rashmika Mandanna|Bakkiyaraj Kannan|
Mandela|2021|Yogi Babu|Sheela Rajkumar|Madonne Ashwin|
Vikram|2022|Kamal Haasan, Vijay Sethupathi, Fahadh Faasil||Lokesh Kanagaraj|
Ponniyin Selvan: I|2022|Vikram, Karthi, Jayam Ravi|Aishwarya Rai, Trisha|Mani Ratnam|
Beast|2022|Vijay|Pooja Hegde|Nelson|Yogi Babu
Valimai|2022|Ajith Kumar|Huma Qureshi|H. Vinoth|
Mahaan|2022|Vikram, Dhruv Vikram|Simran|Karthik Subbaraj|
Cobra|2022|Vikram|Srinidhi Shetty|R. Ajay Gnanamuthu|
Thiruchitrambalam|2022|Dhanush|Nithya Menen, Raashii Khanna, Priya Bhavani Shankar|Mithran R. Jawahar|
Don|2022|Sivakarthikeyan|Priyanka Mohan|Cibi Chakaravarthi|Soori
Love Today|2022|Pradeep Ranganathan|Ivana|Pradeep Ranganathan|Yogi Babu
Sardar|2022|Karthi|Raashii Khanna, Rajisha Vijayan|P. S. Mithran|
Virumaan|2022|Karthi|Aditi Shankar|M. Muthaiah|
Etharkkum Thunindhavan|2022|Suriya|Priyanka Mohan|Pandiraj|Soori
Kaathuvaakula Rendu Kaadhal|2022|Vijay Sethupathi|Nayanthara, Samantha|Vignesh Shivan|Redin Kingsley
Vendhu Thanindhathu Kaadu|2022|Silambarasan|Siddhi Idnani|Gautham Menon|
Jailer|2023|Rajinikanth|Ramya Krishnan|Nelson|Yogi Babu
Leo|2023|Vijay|Trisha|Lokesh Kanagaraj|
Varisu|2023|Vijay|Rashmika Mandanna|Vamshi Paidipally|Yogi Babu
Thunivu|2023|Ajith Kumar|Manju Warrier|H. Vinoth|
Ponniyin Selvan: II|2023|Vikram, Karthi, Jayam Ravi|Aishwarya Rai, Trisha|Mani Ratnam|
Maamannan|2023|Udhayanidhi Stalin, Vadivelu, Fahadh Faasil|Keerthy Suresh|Mari Selvaraj|Vadivelu
Maaveeran|2023|Sivakarthikeyan|Aditi Shankar|Madonne Ashwin|Yogi Babu
Mark Antony|2023|Vishal, S. J. Suryah|Ritu Varma|Adhik Ravichandran|
Viduthalai Part 1|2023|Soori, Vijay Sethupathi|Bhavani Sre|Vetrimaaran|
Vaathi|2023|Dhanush|Samyuktha|Venky Atluri|
Pathu Thala|2023|Silambarasan|Priya Bhavani Shankar|Obeli N. Krishna|
Jigarthanda DoubleX|2023|Raghava Lawrence, S. J. Suryah|Nimisha Sajayan|Karthik Subbaraj|
Parking|2023|Harish Kalyan, M. S. Bhaskar|Indhuja Ravichandran|Ramkumar Balakrishnan|
Good Night|2023|Manikandan|Meetha Raghunath|Vinayak Chandrasekaran|
Captain Miller|2024|Dhanush|Priyanka Mohan|Arun Matheswaran|
Raayan|2024|Dhanush|Dushara Vijayan|Dhanush|
Maharaja|2024|Vijay Sethupathi|Mamta Mohandas, Abhirami|Nithilan Saminathan|
Amaran|2024|Sivakarthikeyan|Sai Pallavi|Rajkumar Periasamy|
Ayalaan|2024|Sivakarthikeyan|Rakul Preet Singh|R. Ravikumar|
Meiyazhagan|2024|Karthi, Arvind Swamy|Sri Divya|C. Prem Kumar|
Kanguva|2024|Suriya|Disha Patani|Siva|
Thangalaan|2024|Vikram|Malavika Mohanan, Parvathy Thiruvothu|Pa. Ranjith|
Vettaiyan|2024|Rajinikanth|Manju Warrier, Ritika Singh|T. J. Gnanavel|
The Greatest of All Time|2024|Vijay|Meenakshi Chaudhary, Sneha|Venkat Prabhu|
Indian 2|2024|Kamal Haasan|Kajal Aggarwal, Rakul Preet Singh|Shankar|
Lubber Pandhu|2024|Harish Kalyan, Dinesh|Sanjana Krishnamoorthy|Tamizharasan Pachamuthu|
Garudan|2024|Soori, Sasikumar|Sshivada|R. S. Durai Senthilkumar|
Madha Gaja Raja|2025|Vishal|Anjali, Varalaxmi Sarathkumar|Sundar C|Santhanam
Dragon|2025|Pradeep Ranganathan|Anupama Parameswaran, Kayadu Lohar|Ashwath Marimuthu|
Vidaamuyarchi|2025|Ajith Kumar|Trisha|Magizh Thirumeni|
Good Bad Ugly|2025|Ajith Kumar|Trisha|Adhik Ravichandran|
Retro|2025|Suriya|Pooja Hegde|Karthik Subbaraj|
Thug Life|2025|Kamal Haasan, Silambarasan|Trisha, Abhirami|Mani Ratnam|
Tourist Family|2025|Sasikumar|Simran|Abishan Jeevinth|
Veera Dheera Sooran|2025|Vikram|Dushara Vijayan|S. U. Arun Kumar|
Coolie|2025|Rajinikanth|Shruti Haasan|Lokesh Kanagaraj|
Madharaasi|2025|Sivakarthikeyan|Rukmini Vasanth|A. R. Murugadoss|
`;

export interface MovieInput {
  title: string;
  year: number;
  heroes: string[];
  heroines: string[];
  director: string;
  comedians: string[];
}

export interface TamilMovie extends MovieInput {
  id: number;
  decade: string;
}

const split = (s: string) => s.split(',').map(x => x.trim()).filter(Boolean);

/** The films that ship with the app, as editable records. */
export const DEFAULT_MOVIE_INPUTS: MovieInput[] = RAW.split('\n')
  .map(l => l.trim())
  .filter(Boolean)
  .map(line => {
    const [title, year, heroes, heroines, director, comedians] = line.split('|');
    return {
      title: title.trim(),
      year: Number(year),
      heroes: split(heroes ?? ''),
      heroines: split(heroines ?? ''),
      director: (director ?? '').trim(),
      comedians: split(comedians ?? ''),
    };
  });

export const MIN_YEAR = 1930;
export const MAX_YEAR = 2100;

export function buildMovies(list: MovieInput[]): TamilMovie[] {
  return list.map((m, id) => ({ ...m, id, decade: `${Math.floor(m.year / 10) * 10}s` }));
}

export const TAMIL_MOVIES: TamilMovie[] = buildMovies(DEFAULT_MOVIE_INPUTS);

// ── Editable content (Admin -> Games -> Dumb Charades) ──
export interface CharadesContent { movies: MovieInput[] }
export const CHARADES_DEFAULTS: CharadesContent = { movies: DEFAULT_MOVIE_INPUTS };

const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const names = (v: unknown) => (Array.isArray(v) ? v.map(x => text(x, 60)).filter(Boolean).slice(0, 8) : []);

/** Cleans one film; null when it has no title or a believable year. */
export function cleanMovie(raw: unknown): MovieInput | null {
  if (!raw || typeof raw !== 'object') return null;
  const m = raw as Record<string, unknown>;
  const title = text(m.title, 80);
  const year = Math.round(Number(m.year));
  if (!title || !Number.isFinite(year) || year < MIN_YEAR || year > MAX_YEAR) return null;
  return { title, year, heroes: names(m.heroes), heroines: names(m.heroines), director: text(m.director, 60), comedians: names(m.comedians) };
}

/** Cleans a saved list. Needs at least a handful of films, otherwise the built-in list stays. */
export function sanitizeCharadesContent(raw: unknown): CharadesContent | null {
  const list = (raw as { movies?: unknown } | null)?.movies;
  if (!Array.isArray(list)) return null;
  const movies = list.map(cleanMovie).filter((m): m is MovieInput => m !== null);
  return movies.length >= 5 ? { movies } : null;
}

export type CharadesCategory = 'all' | 'decade' | 'hero' | 'heroine' | 'director' | 'comedian';

export const CATEGORY_LABELS: Record<CharadesCategory, string> = {
  all: 'All movies',
  decade: 'Decade',
  hero: 'Hero',
  heroine: 'Heroine',
  director: 'Director',
  comedian: 'Comedian',
};

/** A person gets their own entry once they have at least this many films. */
const MIN_PER_CATEGORY = 3;

const valuesOf = (m: TamilMovie, cat: CharadesCategory): string[] => {
  switch (cat) {
    case 'decade': return [m.decade];
    case 'hero': return m.heroes;
    case 'heroine': return m.heroines;
    case 'director': return m.director ? [m.director] : [];
    case 'comedian': return m.comedians;
    default: return [];
  }
};

export interface CategoryOption { value: string; count: number }

/** Choices for a category, e.g. every hero with enough films. Decades are
 *  sorted oldest first; people by number of films (then name). */
export function categoryOptions(movies: TamilMovie[], cat: CharadesCategory): CategoryOption[] {
  if (cat === 'all') return [];
  const counts = new Map<string, number>();
  for (const m of movies) {
    for (const v of new Set(valuesOf(m, cat))) counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const list = [...counts.entries()]
    .filter(([, n]) => cat === 'decade' || n >= MIN_PER_CATEGORY)
    .map(([value, count]) => ({ value, count }));
  return cat === 'decade'
    ? list.sort((a, b) => a.value.localeCompare(b.value))
    : list.sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

export function moviesFor(movies: TamilMovie[], cat: CharadesCategory, value: string | null): TamilMovie[] {
  if (cat === 'all' || !value) return movies;
  return movies.filter(m => valuesOf(m, cat).includes(value));
}
