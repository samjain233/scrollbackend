import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

enum CardCategory {
    HISTORY = 'history',
    SCIENCE = 'science',
    GEOGRAPHY = 'geography',
    ECONOMICS = 'economics',
}

const mockCards = [
    {
        title: 'The Great Emu War',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Emu_1_-_Shene.jpg/1200px-Emu_1_-_Shene.jpg',
        content: 'In 1932, Australia declared war on emus. Soldiers used machine guns but failed to curb the population. The emus "won" as the military withdrew.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Quantum Entanglement',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f1/Quantum_mechanics_entanglement.png/1200px-Quantum_mechanics_entanglement.png',
        content: 'Particles remain connected across vast distances. Einstein called it "spooky action at a distance". Forms the basis of quantum computing.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Library of Alexandria',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Fire_of_Alexandria.jpg/1200px-Fire_of_Alexandria.jpg',
        content: 'Was the largest library in the ancient world. Housed countless scrolls of knowledge. Its destruction lost centuries of history.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'The Mariana Trench',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Mariana_Trench_location_map.png/1200px-Mariana_Trench_location_map.png',
        content: 'Deepest part of the world\'s oceans. Reaches nearly 11,000 meters down. Home to unique, pressure-resistant life.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Inflation',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f6/100000_mark_1923.jpg/1200px-100000_mark_1923.jpg',
        content: 'Rate at which prices rise over time. Erodes purchasing power of currency. Can be caused by printing too much money.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Rosetta Stone',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/Rosetta_Stone.JPG/1200px-Rosetta_Stone.JPG',
        content: 'Key to deciphering Egyptian hieroglyphs. Features text in three different scripts. Discovered by French soldiers in 1799.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Black Holes',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4f/Black_hole_-_Messier_87_crop_max_res.jpg/1200px-Black_hole_-_Messier_87_crop_max_res.jpg',
        content: 'Regions where gravity pulls so much that light cannot get out. Formed from dying stars. Time slows down near the event horizon.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Silk Road',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/74/Silk_route.jpg/1200px-Silk_route.jpg',
        content: 'Network of trade routes connecting East and West. Facilitated exchange of goods, culture, and ideas. Operated from 2nd century BCE to 18th century.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Plate Tectonics',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Plates_tect2_en.svg/1200px-Plates_tect2_en.svg',
        content: 'Earth\'s outer shell is divided into plates. Movement causes earthquakes and volcanoes. Explains continental drift over millions of years.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Supply and Demand',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Supply-and-demand.svg/1200px-Supply-and-demand.svg',
        content: 'Core model of price determination. High demand + low supply = high price. Low demand + high supply = low price.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Moon Landing',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Aldrin_Apollo_11_original.jpg/1200px-Aldrin_Apollo_11_original.jpg',
        content: 'Apollo 11 landed on the moon in 1969. Neil Armstrong was the first human to walk on it. Marked the peak of the Space Race.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'DNA Structure',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/DNA_animation.gif/1200px-DNA_animation.gif',
        content: 'Double helix shape discovered in 1953. Carries genetic instructions for life. Watson, Crick, and Franklin were key figures.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Amazon Rainforest',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Amazon_Rainforest_-_Brazil.jpg/1200px-Amazon_Rainforest_-_Brazil.jpg',
        content: 'Largest rainforest on Earth. Produces 20% of the world\'s oxygen. Home to millions of species.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Cryptocurrency',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Bitcoin.jpg/1200px-Bitcoin.jpg',
        content: 'Digital currency using encryption techniques. Bitcoin was the first, created in 2009. Operates on decentralized blockchain technology.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Fall of Rome',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/63/Cole_Thomas_The_Course_of_Empire_Destruction_1836.jpg/1200px-Cole_Thomas_The_Course_of_Empire_Destruction_1836.jpg',
        content: 'Western Roman Empire fell in 476 AD. Caused by invasions, economic troubles, and corruption. Led to the Middle Ages in Europe.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Photosynthesis',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/db/Photosynthesis.gif/1200px-Photosynthesis.gif',
        content: 'Plants convert sunlight into energy. Produces oxygen as a byproduct. Essential for life on Earth.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'Mount Everest',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg/1200px-Mount_Everest_as_seen_from_Drukair2_PLW_edit.jpg',
        content: 'Highest mountain above sea level. Located in the Himalayas. Continues to grow due to tectonic activity.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'GDP (Gross Domestic Product)',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b8/Countries_by_GDP_%28nominal%29_in_2014.svg/1200px-Countries_by_GDP_%28nominal%29_in_2014.svg.png',
        content: 'Total value of goods produced in a country. Primary indicator of economic health. Does not account for income inequality.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Industrial Revolution',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9e/Hartmann_Maschinenhalle_1868.jpg/1200px-Hartmann_Maschinenhalle_1868.jpg',
        content: 'Transition to new manufacturing processes. Started in Britain in the 18th century. Shifted society from agrarian to industrial.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Evolution',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ae/Darwin%27s_finches_by_Gould.jpg/1200px-Darwin%27s_finches_by_Gould.jpg',
        content: 'Process by which species change over time. Proposed by Charles Darwin. Driven by natural selection.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Great Barrier Reef',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Great_Barrier_Reef.jpg/1200px-Great_Barrier_Reef.jpg',
        content: 'World\'s largest coral reef system. Located off the coast of Australia. Visible from space.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Compound Interest',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/22/Compound_Interest_with_Varying_Frequencies.svg/1200px-Compound_Interest_with_Varying_Frequencies.svg.png',
        content: 'Interest calculated on the initial principal and accumulated interest. Can grow wealth exponentially over time. Einstein called it the "eighth wonder of the world".',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Printing Press',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/PrintMus_038.jpg/1200px-PrintMus_038.jpg',
        content: 'Invented by Johannes Gutenberg around 1440. Allowed mass production of books. Spread literacy and knowledge rapidly.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'The Big Bang',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6f/CMB_Timeline300_no_W_MAP.jpg/1200px-CMB_Timeline300_no_W_MAP.jpg',
        content: 'Theory of how the universe began. Started as a singularity 13.8 billion years ago. Universe has been expanding ever since.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'Antarctica',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/fa/Antarctica_6400px_from_Blue_Marble.jpg/1200px-Antarctica_6400px_from_Blue_Marble.jpg',
        content: 'Coldest, driest, and windiest continent. Contains 70% of the world\'s fresh water. No permanent human population.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Opportunity Cost',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7e/Opportunity_Cost.png/1200px-Opportunity_Cost.png',
        content: 'The value of the next best alternative foregone. Every choice has a cost. Fundamental concept in decision making.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Internet',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Internet_map_1024.jpg/1200px-Internet_map_1024.jpg',
        content: 'Global system of interconnected computer networks. Origins in ARPANET (1960s). Revolutionized communication and commerce.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Vaccines',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Vaccination.jpg/1200px-Vaccination.jpg',
        content: 'Biological preparations that provide immunity. Eradicated smallpox. Prevent millions of deaths annually.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Sahara Desert',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8d/Sahara_desert.jpg/1200px-Sahara_desert.jpg',
        content: 'Largest hot desert in the world. Covers most of North Africa. Was once lush and green.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Stock Market',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/00/New_York_Stock_Exchange_-_panoramio_%285%29.jpg/1200px-New_York_Stock_Exchange_-_panoramio_%285%29.jpg',
        content: 'Marketplace for buying and selling company shares. Allows companies to raise capital. Indicator of economic sentiment.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Wright Brothers',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/98/Wright_First_Flight_1903.jpg/1200px-Wright_First_Flight_1903.jpg',
        content: 'Invented the first successful airplane. First flight in 1903 at Kitty Hawk. Pioneered aviation technology.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Penicillin',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/ac/Alexander_Fleming_1945.jpg/1200px-Alexander_Fleming_1945.jpg',
        content: 'First true antibiotic. Discovered by Alexander Fleming in 1928. Treats bacterial infections.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Nile River',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2b/Nile_River_and_delta_from_orbit.jpg/1200px-Nile_River_and_delta_from_orbit.jpg',
        content: 'Longest river in the world (disputed). Lifeline of ancient and modern Egypt. Flows north into the Mediterranean Sea.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Globalization',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/41/Global_World_Telecommunications_Map.png/1200px-Global_World_Telecommunications_Map.png',
        content: 'Integration of national economies and cultures. Driven by trade and technology. Creates interdependence between nations.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Berlin Wall',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5d/Berlinermauer.jpg/1200px-Berlinermauer.jpg',
        content: 'Divided East and West Berlin (1961-1989). Symbol of the Cold War. Its fall marked the end of Soviet influence.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Relativity',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d5/Spacetime_curvature.png/1200px-Spacetime_curvature.png',
        content: 'Einstein\'s theory of gravity and time. E=mc² relates energy and mass. Time is relative to speed and gravity.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Grand Canyon',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f9/Grand_Canyon_of_the_Yellowstone.jpg/1200px-Grand_Canyon_of_the_Yellowstone.jpg',
        content: 'Carved by the Colorado River. Reveals billions of years of geological history. One of the natural wonders of the world.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Monopoly',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/65/Monopoly_board_game.jpg/1200px-Monopoly_board_game.jpg',
        content: 'Market structure with a single seller. Can lead to higher prices and less innovation. Often regulated by governments.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The French Revolution',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/57/Anonymous_-_Prise_de_la_Bastille.jpg/1200px-Anonymous_-_Prise_de_la_Bastille.jpg',
        content: 'Uprising against the monarchy in 1789. Led to the rise of Napoleon. Spread ideals of liberty, equality, and fraternity.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'The Periodic Table',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1b/Periodic_table_of_elements_w_atomic_number.svg/1200px-Periodic_table_of_elements_w_atomic_number.svg.png',
        content: 'Organizes elements by atomic number. Created by Dmitri Mendeleev. Predicts properties of unknown elements.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'Mount Kilimanjaro',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Mt._Kilimanjaro_12.2006.JPG/1200px-Mt._Kilimanjaro_12.2006.JPG',
        content: 'Highest mountain in Africa. Dormant volcano in Tanzania. Snow-capped peak near the equator.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Fiscal Policy',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/Fiscal_policy.png/1200px-Fiscal_policy.png',
        content: 'Government use of spending and taxation. Used to influence the economy. Key tool alongside monetary policy.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Renaissance',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Shakespeare.jpg/1200px-Shakespeare.jpg',
        content: 'Rebirth of art, culture, and science. Started in Italy in the 14th century. Bridged the Middle Ages and modern history.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Climate Change',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a5/Global_warming_map.jpg/1200px-Global_warming_map.jpg',
        content: 'Long-term shifts in temperatures and weather. Accelerated by human activities. Threatens ecosystems and human societies.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Dead Sea',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Dead_Sea_by_David_Shankbone.jpg/1200px-Dead_Sea_by_David_Shankbone.jpg',
        content: 'Lowest point on Earth\'s surface. So salty that people float easily. Located between Jordan and Israel.',
        category: CardCategory.GEOGRAPHY,
    },
    {
        title: 'Tariffs',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/99/SmootHawley.png/1200px-SmootHawley.png',
        content: 'Taxes on imported goods. Used to protect domestic industries. Can lead to trade wars.',
        category: CardCategory.ECONOMICS,
    },
    {
        title: 'The Magna Carta',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/ee/Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg/1200px-Magna_Carta_%28British_Library_Cotton_MS_Augustus_II.106%29.jpg',
        content: 'Signed by King John in 1215. Limited the power of the monarch. Established the principle that no one is above the law.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Neurons',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Neuron_Hand-tuned.svg/1200px-Neuron_Hand-tuned.svg.png',
        content: 'Nerve cells that transmit information. Building blocks of the brain and nervous system. Communicate via electrical and chemical signals.',
        category: CardCategory.SCIENCE,
    },
    {
        title: 'The Great Wall of China',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/23/The_Great_Wall_of_China_at_Jinshanling-edit.jpg/1200px-The_Great_Wall_of_China_at_Jinshanling-edit.jpg',
        content: 'Series of fortifications made of stone and earth. Built to protect against invasions. Longest man-made structure in the world.',
        category: CardCategory.HISTORY,
    },
    {
        title: 'Microeconomics',
        imageUrl: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5c/Indifference_curves.svg/1200px-Indifference_curves.svg.png',
        content: 'Study of individual and business decisions. Focuses on supply, demand, and price. Contrasts with macroeconomics.',
        category: CardCategory.ECONOMICS,
    },
];

async function main() {
    console.log('Start seeding ...');

    // Seed Admins
    const admins = [
        { email: 'admin@reeld.com', name: 'Super Admin' },
        { email: 'aatman@reeld.com', name: 'Aatman' },
        { email: 'vishal@reeld.com', name: 'Vishal' },
        { email: 'sambhav@reeld.com', name: 'Sambhav' },
    ];

    const password = 'admin123';
    const hashedPassword = await bcrypt.hash(password, 10);

    for (const admin of admins) {
        const existingAdmin = await prisma.admin.findUnique({ where: { email: admin.email } });

        if (!existingAdmin) {
            await prisma.admin.create({
                data: {
                    email: admin.email,
                    password: hashedPassword,
                    name: admin.name,
                },
            });
            console.log(`Created admin user: ${admin.name}`);
        } else {
            console.log(`Admin user ${admin.name} already exists`);
        }
    }

    // Seed Cards
    for (const card of mockCards) {
        const existingCard = await prisma.card.findFirst({
            where: { title: card.title },
        });

        if (!existingCard) {
            const createdCard = await prisma.card.create({
                data: card,
            });
            console.log(`Created card with id: ${createdCard.id}`);
        } else {
            console.log(`Card "${card.title}" already exists.`);
        }
    }
    console.log('Seeding finished.');
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
