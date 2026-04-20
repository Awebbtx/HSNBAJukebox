# ASM Field Reference

Source: `json_adoptable_animals` — account `hsnba`  
Sample pulled: 2026-04-18 — **121 animals** in payload  
Sampling strategy: all records sorted newest-first by `LASTCHANGEDDATE`; each field shows the first non-empty value found across the full set (173 of 365 fields had at least one populated value)

---

## Core Animal Identity

| Field | Sample Value | Notes |
|---|---|---|
| `ID` | `73695` | Internal ASM animal ID — used in image/profile URLs |
| `ANIMALNAME` | `Phoebe` | Display name |
| `CODE` | `NBD301` | Short code (same as `SHORTCODE`) |
| `SHORTCODE` | `NBD301` | Abbreviated shelter code |
| `SHELTERCODE` | `NBD2026301` | Full shelter code |
| `YEARCODEID` | `301` | Numeric part of year code |
| `UNIQUECODEID` | `0` | Alternate unique ID (rarely populated) |
| `EXTRAIDS` | _(empty)_ | Extra external IDs |
| `ACCEPTANCENUMBER` | `Scooby and The Gang` | Intake acceptance number — can be used for group/litter names |
| `RECORDVERSION` | `151703` | Row version counter (changes on any update) |

---

## Species / Breed / Type

| Field | Sample Value | Notes |
|---|---|---|
| `SPECIESID` | `1` | Numeric species ID |
| `SPECIESNAME` | `Dog` | Human-readable species |
| `ANIMALTYPEID` | `42` | Numeric animal type ID |
| `ANIMALTYPENAME` | `NB (New Braunfels Animal Control)` | Organization sub-type label |
| `BREEDID` | `125` | Primary breed ID |
| `BREED2ID` | `125` | Secondary breed ID |
| `BREEDNAME` | `Labrador Retriever` | Primary breed name |
| `BREEDNAME1` | `Labrador Retriever` | Alias for primary breed |
| `BREEDNAME2` | `Labrador Retriever` | Secondary breed name |
| `CROSSBREED` | `1` | `1` = mixed/crossbreed |
| `CROSSBREEDNAME` | `No` | Human-readable crossbreed flag |
| `PETFINDERSPECIES` | `Dog` | Species string for Petfinder export |
| `PETFINDERBREED` | `Labrador Retriever` | Primary breed for Petfinder |
| `PETFINDERBREED2` | `Labrador Retriever` | Secondary breed for Petfinder |

---

## Physical Attributes

| Field | Sample Value | Notes |
|---|---|---|
| `SEX` | `1` | `0` = Female, `1` = Male |
| `SEXNAME` | `Male` | Human-readable sex |
| `BASECOLOURID` | `1` | Numeric coat colour ID |
| `BASECOLOURNAME` | `Black` | Coat colour name |
| `ADOPTAPETCOLOUR` | `Black` | Colour string for AdoptAPet export |
| `COATTYPE` | `0` | Numeric coat type ID |
| `COATTYPENAME` | `Short` | Coat type label |
| `SIZENAME` | `Large` | Size label |
| `SIZE` | `1` | Numeric size ID |
| `WEIGHT` | `90.2` | Weight in lbs |
| `MARKINGS` | `Ear Tipped` | Physical markings / distinguishing features (e.g. `Ear Tipped` for TNR cats) |
| `DECLAWED` | `0` | `1` = declawed (cats) |
| `DECLAWEDNAME` | `No` | Human-readable |

---

## Age

| Field | Sample Value | Notes |
|---|---|---|
| `DATEOFBIRTH` | `2018-04-18T00:00:00` | Date of birth (may be estimated) |
| `ESTIMATEDDOB` | `1` | `1` = DOB is an estimate |
| `ESTIMATEDDOBNAME` | `No` | Human-readable |
| `AGEGROUP` | `Senior (7 years +)` | Age bracket label |
| `AGEGROUPACTIVEMOVEMENT` | `Senior (7 years +)` | Age group at time of active movement |
| `ANIMALAGE` | `8 years 0 months.` | Human-readable age string |

---

## Location / Placement

| Field | Sample Value | Notes |
|---|---|---|
| `SHELTERLOCATIONID` / `SHELTERLOCATION` | `9` | Numeric internal location ID |
| `SHELTERLOCATIONNAME` | `HSNBA: Stray Side:Stray Dog Room` | Full location path |
| `SHELTERLOCATIONUNIT` | `29 (flood)` | Cage/pen/unit within location |
| `SHELTERLOCATIONDESCRIPTION` | `Feral evaluations` | Optional description of location |
| `DISPLAYLOCATION` | `HSNBA: Stray Side:Stray Dog Room::29 (flood)` | Formatted location + unit for display |
| `DISPLAYLOCATIONNAME` | `HSNBA: Stray Side:Stray Dog Room` | Location without unit |
| `SITEID` | `1` | Multi-site: numeric site ID |
| `SITENAME` | `HSNBA` | Multi-site: site name |
| `PICKUPLOCATIONID` | `9` | Intake pickup location ID |
| `PICKUPLOCATIONNAME` | `Bexar County` | Intake pickup location name |
| `PICKUPADDRESS` | _(empty)_ | Street address where animal was picked up |
| `ENTRYLOCATION` | `2281 Waterford Grace` | Street address of entry (stray found address) |
| `ISPICKUP` | `0` | `1` = animal was picked up by officer |
| `ISPICKUPNAME` | `No` | Human-readable |

---

## Intake / Entry

| Field | Sample Value | Notes |
|---|---|---|
| `DATEBROUGHTIN` | `2026-04-17T16:47:48` | Intake date (ISO 8601, may include time) |
| `MOSTRECENTENTRYDATE` | `2026-04-18T00:00:00` | Most recent intake (may differ if returned) |
| `ENTRYTYPEID` | `2` | Numeric entry type ID |
| `ENTRYTYPENAME` | `Stray` | Entry type label |
| `ENTRYREASONID` | `7` | Numeric entry reason ID |
| `ENTRYREASONNAME` | `Stray` | Entry reason label |
| `REASONFORENTRY` | _(empty)_ | Free-text reason for entry |
| `REASONNO` | _(empty)_ | Alternate reason reference |
| `INTAKEHANDLING` | _(empty)_ | Staff notes on intake handling |
| `INTAKEHEALTH` | _(empty)_ | Health observations at intake |
| `INTAKETEMPERAMENT` | _(empty)_ | Temperament notes at intake |
| `ISTRANSFER` | `0` | `1` = transferred in from another shelter |
| `ISTRANSFERNAME` | `No` | Human-readable |
| `ISCOURTESY` | `0` | `1` = courtesy listing (not physically on-site) |
| `NONSHELTERANIMAL` | `0` | `1` = owned animal in system but not shelter resident |
| `NONSHELTERANIMALNAME` | `No` | Human-readable |

---

## Adoption Availability / Status

| Field | Sample Value | Notes |
|---|---|---|
| `ADOPTABLE` | `1` | `1` = currently adoptable |
| `ISNOTAVAILABLEFORADOPTION` | `0` | `1` = blocked from adoption |
| `ISNOTAVAILABLEFORADOPTIONNAME` | `No` | Human-readable |
| `DATEAVAILABLEFORADOPTION` | `2026-04-18T17:26:45.456474` | Date animal became available |
| `ISHOLD` | `1` | `1` = currently on hold |
| `HOLDUNTILDATE` | `2026-04-22T00:00:00` | Hold expiry date |
| `ISQUARANTINE` | `0` | `1` = in quarantine |
| `ARCHIVED` | `0` | `1` = record archived (not active) |
| `OUTCOMEDATE` | `2026-04-18T00:00:00` | Date of final outcome (populated even for On Shelter when a movement exists) |
| `OUTCOMENAME` | `On Shelter` | Current outcome / status label |
| `OUTCOMEQUALIFIER` | _(empty)_ | Qualifier detail for outcome |
| `PUTTOSLEEP` | `0` | `1` = euthanized |
| `PUTTOSLEEPNAME` | `No` | Human-readable |
| `PTSREASONID` | `9` | Numeric PTS reason ID |
| `PTSREASONNAME` | `Aggression` | PTS reason label (may be populated even if not PTS'd) |
| `PTSREASON` | _(empty)_ | Free-text PTS reason |
| `DIEDOFFSHELTER` | `0` | `1` = died outside shelter care |
| `DIEDOFFSHELTERNAME` | `No` | Human-readable |
| `DECEASEDDATE` | _(empty)_ | Date of death |
| `ISDOA` | `0` | `1` = dead on arrival |
| `ISDOANAME` | `No` | Human-readable |
| `CRUELTYCASE` | `0` | `1` = cruelty investigation case |
| `CRUELTYCASENAME` | `No` | Human-readable |

---

## Stay Duration

| Field | Sample Value | Notes |
|---|---|---|
| `DAYSONSHELTER` | `1` | Days since most recent intake |
| `TOTALDAYSONSHELTER` | `1` | Cumulative days across all stays |
| `TIMEONSHELTER` | `1 day.` | Human-readable current stay duration |
| `TOTALTIMEONSHELTER` | `1 day.` | Human-readable total stay duration |

---

## Active Movement (Adoption / Foster / Transfer Out)

| Field | Sample Value | Notes |
|---|---|---|
| `ACTIVEMOVEMENTID` | `105858` | `0` = no active movement; non-zero = movement record ID |
| `ACTIVEMOVEMENTTYPE` | `2` | Numeric movement type (`1`=Adoption, `2`=Foster, `3`=Transfer, etc.) |
| `ACTIVEMOVEMENTTYPENAME` | `Foster` | Movement type label (`Adoption`, `Foster`, `Transfer`, etc.) |
| `ACTIVEMOVEMENTDATE` | `2026-04-18T00:00:00` | Date movement started |
| `ACTIVEMOVEMENTRETURNDATE` | _(empty)_ | Return date (if applicable) |
| `ACTIVEMOVEMENTTRIALENDDATE` | _(empty)_ | Trial adoption end date |
| `ACTIVEMOVEMENTADOPTIONNUMBER` | `105858` | Adoption contract number (same as movement ID) |
| `ACTIVEMOVEMENTINSURANCENUMBER` | _(empty)_ | Insurance number on movement |
| `ACTIVEMOVEMENTDONATION` | _(empty)_ | Donation amount on movement |
| `ACTIVEMOVEMENTREASONFORRETURN` | _(empty)_ | Reason for return if movement ended |
| `ACTIVEMOVEMENTCOMMENTS` | _(empty)_ | Free-text movement comments |
| `ACTIVEMOVEMENTCREATEDBY` | _(empty)_ | User who created the movement |
| `ACTIVEMOVEMENTCREATEDBYNAME` | _(empty)_ | Display name of creator |
| `ACTIVEMOVEMENTCREATEDDATE` | `2026-04-18T15:52:47` | Record creation timestamp |
| `ACTIVEMOVEMENTLASTCHANGEDBY` | _(empty)_ | User who last modified |
| `ACTIVEMOVEMENTLASTCHANGEDDATE` | `2026-04-18T15:52:47` | Last modification timestamp |
| `ACTIVEMOVEMENTRESERVATIONDATE` | `2026-04-18T00:00:00` | Reservation date tied to movement |
| `ACTIVEMOVEMENTRETURN` | _(empty)_ | Return flag |
| `HASFUTUREADOPTION` | `0` | `1` = future adoption scheduled |
| `HASTRIALADOPTION` | `0` | `1` = trial adoption in progress |
| `HASTRIALADOPTIONNAME` | `No` | Human-readable |
| `HASPERMANENTFOSTER` | `0` | `1` = in permanent foster |

---

## Reservations

| Field | Sample Value | Notes |
|---|---|---|
| `ACTIVERESERVATIONS` | `0` | Count of active reservations |
| `HASACTIVERESERVE` | `1` | `1` = has at least one active reservation |
| `HASACTIVERESERVENAME` | `No` | Human-readable |
| `RESERVATIONDATE` | `2026-03-28T13:51:00` | Date of active reservation |
| `RESERVATIONSTATUSNAME` | `Application Sent to Foster` | Status label of reservation |
| `RESERVEDOWNERID` | `0` | Person ID who has reserved |
| `RESERVEDOWNERNAME` | _(empty)_ | Reserved-by full name |
| `RESERVEDOWNERFORENAMES` | _(empty)_ | Reserved-by first name |
| `RESERVEDOWNERSURNAME` | _(empty)_ | Reserved-by last name |
| `RESERVEDOWNERADDRESS` | _(empty)_ | Reserved-by address |
| `RESERVEDOWNERTOWN` | _(empty)_ | Reserved-by city |
| `RESERVEDOWNERCOUNTY` | _(empty)_ | Reserved-by county/state |
| `RESERVEDOWNERPOSTCODE` | _(empty)_ | Reserved-by postcode |
| `RESERVEDOWNEREMAILADDRESS` | _(empty)_ | Reserved-by email |
| `RESERVEDOWNERHOMETELEPHONE` | _(empty)_ | Reserved-by home phone |
| `RESERVEDOWNERMOBILETELEPHONE` | _(empty)_ | Reserved-by mobile |
| `RESERVEDOWNERWORKTELEPHONE` | _(empty)_ | Reserved-by work phone |
| `RESERVEDOWNERIDNUMBER` | _(empty)_ | Reserved-by ID/DL number |
| `RESERVEDOWNERINITIALS` | _(empty)_ | Reserved-by initials |
| `RESERVEDOWNERTITLE` | _(empty)_ | Reserved-by title |
| `RESERVEDOWNERJURISDICTION` | _(empty)_ | Reserved-by jurisdiction |
| `RESERVEDOWNERLATLONG` | _(empty)_ | Reserved-by GPS coordinates |

---

## Current Owner (Foster / Adopter if moved out)

| Field | Sample Value | Notes |
|---|---|---|
| `OWNERID` | `0` | `0` = on shelter |
| `OWNERNAME` | _(empty)_ | Current owner full name |
| `CURRENTOWNERID` | `0` | Same as OWNERID in most contexts |
| `CURRENTOWNERNAME` | _(empty)_ | Current owner full name |
| `CURRENTOWNERFORENAMES` | _(empty)_ | First name |
| `CURRENTOWNERSURNAME` | _(empty)_ | Last name |
| `CURRENTOWNERINITIALS` | _(empty)_ | Initials |
| `CURRENTOWNERTITLE` | _(empty)_ | Title |
| `CURRENTOWNERADDRESS` | _(empty)_ | Street address |
| `CURRENTOWNERTOWN` | _(empty)_ | City |
| `CURRENTOWNERCOUNTY` | _(empty)_ | County/state |
| `CURRENTOWNERCOUNTRY` | _(empty)_ | Country |
| `CURRENTOWNERPOSTCODE` | _(empty)_ | Postcode/zip |
| `CURRENTOWNEREMAILADDRESS` | _(empty)_ | Email |
| `CURRENTOWNEREMAILADDRESS2` | _(empty)_ | Alternate email |
| `CURRENTOWNERHOMETELEPHONE` | _(empty)_ | Home phone |
| `CURRENTOWNERMOBILETELEPHONE` | _(empty)_ | Mobile phone |
| `CURRENTOWNERWORKTELEPHONE` | _(empty)_ | Work phone |
| `CURRENTOWNERIDNUMBER` | _(empty)_ | Driver's licence / ID number |
| `CURRENTOWNERJURISDICTION` | _(empty)_ | Jurisdiction |
| `CURRENTOWNERLATLONG` | _(empty)_ | GPS coordinates |
| `CURRENTOWNERCOMMENTS` | _(empty)_ | Free-text comments on owner |
| `CURRENTOWNERADDITIONALFLAGS` | _(empty)_ | Pipe-delimited flags on owner record |
| `CURRENTOWNERPOPUPWARNING` | _(empty)_ | Warning shown when owner is opened |
| `FUTUREOWNERNAME` | _(empty)_ | Future adopter name (pre-adoption) |
| `FUTUREOWNEREMAILADDRESS` | _(empty)_ | Future adopter email |

---

## Original Owner (Surrendered From)

| Field | Sample Value | Notes |
|---|---|---|
| `ORIGINALOWNERID` | `0` | ID of surrendering owner |
| `ORIGINALOWNERNAME` | _(empty)_ | Surrendering owner name |
| `ORIGINALOWNERFORENAMES` | _(empty)_ | First name |
| `ORIGINALOWNERSURNAME` | _(empty)_ | Last name |
| `ORIGINALOWNERTITLE` | _(empty)_ | Title |
| `ORIGINALOWNERINITIALS` | _(empty)_ | Initials |
| `ORIGINALOWNERADDRESS` | _(empty)_ | Address |
| `ORIGINALOWNERTOWN` | _(empty)_ | City |
| `ORIGINALOWNERCOUNTY` | _(empty)_ | County/state |
| `ORIGINALOWNERCOUNTRY` | _(empty)_ | Country |
| `ORIGINALOWNERPOSTCODE` | _(empty)_ | Postcode/zip |
| `ORIGINALOWNEREMAILADDRESS` | _(empty)_ | Email |
| `ORIGINALOWNERHOMETELEPHONE` | _(empty)_ | Home phone |
| `ORIGINALOWNERMOBILETELEPHONE` | _(empty)_ | Mobile |
| `ORIGINALOWNERWORKTELEPHONE` | _(empty)_ | Work phone |
| `ORIGINALOWNERIDNUMBER` | _(empty)_ | ID number |
| `ORIGINALOWNERINITIALS` | _(empty)_ | Initials |
| `ORIGINALOWNERJURISDICTION` | _(empty)_ | Jurisdiction |
| `ORIGINALOWNERLATLONG` | _(empty)_ | GPS coordinates |
| `ORIGINALOWNERPOPUPWARNING` | _(empty)_ | Popup warning on owner record |

---

## Brought-In-By Person

| Field | Sample Value | Notes |
|---|---|---|
| `BROUGHTINBYOWNERID` | `0` | Person who brought animal in |
| `BROUGHTINBYOWNERNAME` | _(empty)_ | Name |
| `BROUGHTINBYOWNERADDRESS` | _(empty)_ | Address |
| `BROUGHTINBYOWNERTOWN` | _(empty)_ | City |
| `BROUGHTINBYOWNERCOUNTY` | _(empty)_ | County/state |
| `BROUGHTINBYOWNERPOSTCODE` | _(empty)_ | Postcode |
| `BROUGHTINBYEMAILADDRESS` | _(empty)_ | Email |
| `BROUGHTINBYHOMETELEPHONE` | _(empty)_ | Home phone |
| `BROUGHTINBYMOBILETELEPHONE` | _(empty)_ | Mobile |
| `BROUGHTINBYWORKTELEPHONE` | _(empty)_ | Work phone |
| `BROUGHTINBYIDNUMBER` | _(empty)_ | ID number |
| `BROUGHTINBYJURISDICTION` | _(empty)_ | Jurisdiction |
| `BROUGHTINBYLATLONG` | _(empty)_ | GPS coordinates |

---

## Adoption Coordinator

| Field | Sample Value | Notes |
|---|---|---|
| `ADOPTIONCOORDINATORID` | `0` | `0` = no coordinator assigned |
| `ADOPTIONCOORDINATORNAME` | _(empty)_ | Full name |
| `ADOPTIONCOORDINATORFORENAMES` | _(empty)_ | First name |
| `ADOPTIONCOORDINATORSURNAME` | _(empty)_ | Last name |
| `ADOPTIONCOORDINATOREMAILADDRESS` | _(empty)_ | Email |
| `ADOPTIONCOORDINATORHOMETELEPHONE` | _(empty)_ | Home phone |
| `ADOPTIONCOORDINATORMOBILETELEPHONE` | _(empty)_ | Mobile |
| `ADOPTIONCOORDINATORWORKTELEPHONE` | _(empty)_ | Work phone |

---

## Current Vet

| Field | Sample Value | Notes |
|---|---|---|
| `CURRENTVETID` | `0` | Current vet ID |
| `CURRENTVETNAME` | _(empty)_ | Vet name |
| `CURRENTVETFORENAMES` | _(empty)_ | Vet first name |
| `CURRENTVETSURNAME` | _(empty)_ | Vet last name |
| `CURRENTVETADDRESS` | _(empty)_ | Address |
| `CURRENTVETTOWN` | _(empty)_ | City |
| `CURRENTVETCOUNTY` | _(empty)_ | County/state |
| `CURRENTVETPOSTCODE` | _(empty)_ | Postcode |
| `CURRENTVETEMAILADDRESS` | _(empty)_ | Email |
| `CURRENTVETWORKTELEPHONE` | _(empty)_ | Phone |
| `CURRENTVETLICENCENUMBER` | _(empty)_ | Licence number |
| `OWNERSVETID` | `0` | Owner's regular vet ID |
| `OWNERSVETNAME` | _(empty)_ | Owner's vet name |
| `OWNERSVETADDRESS` | _(empty)_ | Address |
| `OWNERSVETTOWN` | _(empty)_ | City |
| `OWNERSVETCOUNTY` | _(empty)_ | County/state |
| `OWNERSVETPOSTCODE` | _(empty)_ | Postcode |
| `OWNERSVETEMAILADDRESS` | _(empty)_ | Email |
| `OWNERSVETWORKTELEPHONE` | _(empty)_ | Phone |
| `OWNERSVETLICENCENUMBER` | _(empty)_ | Licence number |
| `NEUTEREDBYVETID` | `9733` | Vet who performed neuter (ID references ASM person record) |
| `NEUTERINGVETNAME` | _(empty)_ | Neutering vet name |
| `NEUTERINGVETADDRESS` | _(empty)_ | Address |
| `NEUTERINGVETTOWN` | _(empty)_ | City |
| `NEUTERINGVETCOUNTY` | _(empty)_ | County/state |
| `NEUTERINGVETPOSTCODE` | _(empty)_ | Postcode |
| `NEUTERINGVETEMAILADDRESS` | _(empty)_ | Email |
| `NEUTERINGVETWORKTELEPHONE` | _(empty)_ | Phone |
| `NEUTERINGVETLICENCENUMBER` | _(empty)_ | Licence number |

---

## Medical / Health

| Field | Sample Value | Notes |
|---|---|---|
| `NEUTERED` | `1` | **Used as "ready today" flag in this app** — `1` = ready/neutered |
| `NEUTEREDNAME` | `Yes` | Human-readable |
| `NEUTEREDDATE` | `2026-04-16T00:00:00` | Date of neuter procedure |
| `HASOUTSTANDINGMEDICAL` | `1` | `1` = open medical treatments |
| `HASSPECIALNEEDS` | `0` | `1` = special needs animal |
| `HASSPECIALNEEDSNAME` | `No` | Human-readable |
| `HEALTHPROBLEMS` | `Crypt //BW` | Free-text health problems summary (staff shorthand common) |
| `HEARTWORMTESTED` | `1` | `1` = tested for heartworm |
| `HEARTWORMTESTEDNAME` | `No` | Human-readable |
| `HEARTWORMTESTDATE` | `2026-04-17T00:00:00` | Date of heartworm test |
| `HEARTWORMTESTRESULT` | `1` | `0`=Unknown, `1`=Negative, `2`=Positive |
| `HEARTWORMTESTRESULTNAME` | `Negative` | Human-readable result |
| `COMBITESTED` | `1` | `1` = combo tested (FeLV/FIV for cats) |
| `COMBITESTEDNAME` | `No` | Human-readable (note: reflects DB value, may say No even when tested) |
| `COMBITESTDATE` | `2026-04-10T00:00:00` | Date of combo test |
| `COMBITESTRESULT` | `1` | `0`=Unknown, `1`=Negative, `2`=Positive |
| `COMBITESTRESULTNAME` | `Unknown` | Human-readable |
| `FLVRESULT` | `1` | FeLV result: `0`=Unknown, `1`=Negative, `2`=Positive |
| `FLVRESULTNAME` | `Unknown` | Human-readable |
| `VACCGIVENCOUNT` | `2` | Number of vaccinations given |
| `VACCOUTSTANDINGCOUNT` | `1` | Number of vaccinations still due |
| `VACCRABIESDATE` | `2026-04-01T00:00:00` | Date of most recent rabies vaccine |
| `VACCRABIESNAME` | `Rabies` | Rabies vaccine name/brand |
| `VACCRABIESTAG` | `000009` | Rabies tag number |
| `RABIESTAG` | `000009` | Alternate rabies tag field |
| `HIDDENANIMALDETAILS` | _(empty)_ | Staff-only hidden notes |
| `ANIMALCOMMENTS` | `Yuna goes by "GG" in our house…` | Full public bio text (up to several paragraphs); used as `bio` in slideshow |
| `SEDATION` | `0` | `1` = requires sedation for handling |
| `AMR` | `0` | Antimicrobial resistance flag |
| `ACTIVEDIETNAME` | `Standard` | Current active diet name |
| `ACTIVEDIETDESCRIPTION` | `1 meal a day of dry food` | Diet description |
| `ACTIVEDIETCOMMENTS` | _(empty)_ | Diet comments |
| `ACTIVEDIETSTARTDATE` | `2026-04-17T16:47:48` | Diet start date |

---

## Behavior / Compatibility

| Field | Sample Value | Notes |
|---|---|---|
| `ISGOODWITHCATS` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODWITHCATSNAME` | `Unknown` | Human-readable |
| `ISGOODWITHDOGS` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODWITHDOGSNAME` | `Unknown` | Human-readable |
| `ISGOODWITHCHILDREN` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODWITHCHILDRENNAME` | `Unknown` | Human-readable |
| `ISGOODWITHELDERLY` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODWITHELDERLYNAME` | `Unknown` | Human-readable |
| `ISCRATETRAINED` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISCRATETRAINEDNAME` | `Unknown` | Human-readable |
| `ISHOUSETRAINED` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISHOUSETRAINEDNAME` | `Unknown` | Human-readable |
| `ISGOODONLEAD` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODONLEADNAME` | `Unknown` | Human-readable |
| `ISGOODTRAVELLER` | `2` | `0` = No, `1` = Yes, `2` = Unknown |
| `ISGOODTRAVELLERNAME` | `Unknown` | Human-readable |
| `ONLEASH` | `Unknown` | Text label for on-leash behavior |
| `CARS` | `Unknown` | Comfort in cars |
| `ENERGYLEVEL` | `3` | Energy level numeric (0=unset, 1–5 scale) |
| `PLAYSTYLE` | `Unknown` | Play style description |
| `OVERSTIM` | `Unknown` | Over-stimulation response |
| `REACTAVERSION` | `Unknown` | Reactivity / aversion behavior |
| `REACTCORRECT` | `Unknown` | Responds to correction |
| `RISKKENNELBEHAVIOR` | _(empty)_ | Kennel behavior risk notes |
| `RISKMEDICAL` | _(empty)_ | Medical risk notes |
| `RISKREACTIVITY` | _(empty)_ | Reactivity risk notes |
| `RISKRJM` | _(empty)_ | RJM risk category |
| `RISKSOCIABILITY` | `Unknown` | Sociability risk level |
| `RISKSOCIABILITY2` | _(empty)_ | Secondary sociability risk |
| `INTAKETEMPERAMENT` | _(empty)_ | Temperament at intake |

---

## Identification / Tags / Microchip

| Field | Sample Value | Notes |
|---|---|---|
| `IDENTICHIPPED` | `1` | `1` = microchipped |
| `IDENTICHIPPEDNAME` | `Yes` | Human-readable |
| `IDENTICHIPNUMBER` | `900074001770530` | Primary microchip number |
| `IDENTICHIPDATE` | `2026-04-17T00:00:00` | Date chipped |
| `IDENTICHIPSTATUS` | `0` | Chip status numeric |
| `IDENTICHIP2NUMBER` | _(empty)_ | Secondary chip number |
| `IDENTICHIP2DATE` | _(empty)_ | Secondary chip date |
| `IDENTICHIP2STATUS` | `0` | Secondary chip status |
| `TATTOO` | `0` | `1` = tattooed |
| `TATTOONAME` | `No` | Human-readable |
| `TATTOONUMBER` | _(empty)_ | Tattoo identifier |
| `TATTOODATE` | _(empty)_ | Date tattooed |
| `SMARTTAG` | `0` | SmartTag registered |
| `SMARTTAGNUMBER` | _(empty)_ | SmartTag number |
| `SMARTTAGDATE` | _(empty)_ | SmartTag registration date |
| `SMARTTAGSENTDATE` | _(empty)_ | SmartTag mailed date |
| `SMARTTAGTYPE` | `0` | SmartTag type code |
| `ANIMALPHOTO` | `73695` | Same as ID — used to build image URL |

---

## Photos / Media

| Field | Sample Value | Notes |
|---|---|---|
| `WEBSITEMEDIAID` | `311603` | Primary web photo media ID |
| `WEBSITEMEDIANAME` | `311603.jpg` | Primary web photo filename |
| `WEBSITEMEDIADATE` | `2026-04-18T12:05:11` | Date photo was uploaded |
| `WEBSITEMEDIANOTES` | `Yuna goes by "GG"…` | Public notes tied to the primary web photo — often contains the full bio text |
| `WEBSITEIMAGECOUNT` | `1` | Total number of web photos |
| `PHOTOURLS` | `https://service.sheltermanager.com/asmservice?account=hs0701&method=media_image&mediaid=311603&ts=...` | Direct URL to primary photo (time-limited `ts` param) |
| `WEBSITEVIDEOURL` | _(empty)_ | Video URL |
| `WEBSITEVIDEOMIMETYPE` | _(empty)_ | Video MIME type |
| `WEBSITEVIDEONOTES` | _(empty)_ | Video notes |
| `DOCMEDIAID` | `311603` | Document/media ID |
| `DOCMEDIANAME` | `311603.jpg` | Document/media filename |
| `DOCMEDIADATE` | `2026-04-18T12:05:11` | Document/media date |
| `RECENTLYCHANGEDIMAGES` | `1` | `1` = images changed recently |

---

## Flags / Special Tags

| Field | Sample Value | Notes |
|---|---|---|
| `ADDITIONALFLAGS` | `Green Star/Easily Handlable\|Posted to CCLFD\|` | Pipe-delimited custom flags; examples: `Posted to CCLFD`, `Green Star/Easily Handlable` |
| `POPUPWARNING` | _(empty)_ | Warning shown when record is opened in ASM |
| `ISHOLD` | `1` | See Availability section |
| `ISQUARANTINE` | `0` | See Availability section |
| `SLAMMED` | `1` | Internal flag set when a record is force-overridden/mass-updated |
| `UNITSPONSOR` | `Randall and Patti Sanders` | Name of person/family sponsoring this kennel unit |

---

## Fees / Financials

| Field | Sample Value | Notes |
|---|---|---|
| `FEE` | `12000` | Adoption fee in **cents** (e.g. `12000` = $120.00, `20000` = $200.00) |
| `DAILYBOARDINGCOST` | _(empty)_ | Daily boarding rate |
| `ACTIVEBOARDINGINDATE` | _(empty)_ | Active boarding start date |
| `ACTIVEBOARDINGOUTDATE` | _(empty)_ | Active boarding end date |
| `HASACTIVEBOARDING` | `0` | `1` = currently boarding |

---

## Animal Control

| Field | Sample Value | Notes |
|---|---|---|
| `ANIMALCONTROLINCIDENTID` | `0` | Linked AC incident ID |
| `ANIMALCONTROLINCIDENTNAME` | _(empty)_ | Incident label |
| `ANIMALCONTROLINCIDENTDATE` | _(empty)_ | Incident date |
| `JURISDICTIONID` | `5` | Jurisdiction numeric ID |
| `JURISDICTIONNAME` | `Unknown` | Jurisdiction name (may be `Unknown` if not assigned) |

---

## Bonded Animals

| Field | Sample Value | Notes |
|---|---|---|
| `BONDEDANIMALID` | `70985` | `0` = no bonded pair; non-zero = ID of first bonded animal |
| `BONDEDANIMAL1NAME` | `Salsa (SOL)` | First bonded animal name |
| `BONDEDANIMAL1CODE` | `HQC2025020` | First bonded animal shelter code |
| `BONDEDANIMAL1ARCHIVED` | _(empty)_ | `1` = first bonded animal archived |
| `BONDEDANIMAL1IDENTICHIPNUMBER` | `941010004638883` | First bonded animal microchip number |
| `BONDEDANIMAL2ID` | `0` | Second bonded animal ID |
| `BONDEDANIMAL2NAME` | _(empty)_ | Second bonded animal name |
| `BONDEDANIMAL2CODE` | _(empty)_ | Second bonded animal code |
| `BONDEDANIMAL2ARCHIVED` | _(empty)_ | `1` = second bonded animal archived |
| `BONDEDANIMAL2IDENTICHIPNUMBER` | _(empty)_ | Second bonded chip number |

---

## Asilomar Statistics

| Field | Sample Value | Notes |
|---|---|---|
| `ASILOMARINTAKECATEGORY` | `0` | Asilomar intake category code |
| `ASILOMARISTRANSFEREXTERNAL` | `0` | `1` = transferred from external org |
| `ASILOMAROWNERREQUESTEDEUTHANASIA` | `0` | `1` = owner requested euthanasia |

---

## Record Audit

| Field | Sample Value | Notes |
|---|---|---|
| `CREATEDBY` | _(empty)_ | Username who created record |
| `CREATEDDATE` | `2026-04-18T11:34:28.614325` | Record creation timestamp |
| `LASTCHANGEDBY` | _(empty)_ | Username of last modifier |
| `LASTCHANGEDDATE` | `2026-04-18T15:17:03.997238` | Last modification timestamp |
| `RECORDVERSION` | `151703` | Monotonically increasing version counter |
| `ISNOTFORREGISTRATION` | `0` | `1` = exclude from registration exports |
| `ISNOTFORREGISTRATIONNAME` | `No` | Human-readable |

---

## Fields Mapped by This App (`mapAsmAnimal`)

These ASM fields are consumed by the jukebox slideshow engine:

| ASM Field(s) | App Property | Notes |
|---|---|---|
| `ID` / `ANIMALID` | `id` | Used to build image + profile URLs |
| `ANIMALNAME` / `NAME` | `name` | Display name on slide |
| `SPECIESNAME` | `species` | Detail line |
| `BREEDNAME` / `BREEDNAME1` | `breed` | Detail line |
| `SEXNAME` | `sex` | Detail line |
| `SIZENAME` | `size` | Detail line |
| `AGEGROUP` | `ageGroup` | Detail line |
| `SHELTERLOCATIONNAME` | `location` | Detail line |
| `WEBSITEIMAGECOUNT` | `imageCount` | Used to decide whether to show image |
| `WEBSITEIMAGEURL` / `IMAGEURL` / `WEBSITEIMAGE` / `WEBIMAGE` | `imageUrl` | Falls back to `/api/adoptables/image/{id}` |
| `NEUTERED` | `readyToday` | `1` = "Ready today" on slide |
| `ANIMALCOMMENTS` | `bio` | Bio text on slide |
| `ADDITIONALFLAGS` | `additionalFlags` | Pipe-delimited flags |
| `WEBSITEMEDIAID` | `websiteMediaId` | Used for image proxy fallback |
| _(via buildAsmServiceUrl)_ | `profileUrl` | Deep link to ASM animal view |
| All other fields | `rawFields.*` | Available for custom display slots |
